# Row Level Security (RLS) en StormGuest

## ¿Qué es RLS y por qué lo agregamos?

Row Level Security es una función de PostgreSQL que permite definir **políticas** a nivel de fila: cada query devuelve únicamente las filas que la política autoriza, sin importar cómo se escribió el SQL.

Hasta ahora, el aislamiento multi-tenant de StormGuest dependía solo de la capa de aplicación (el backend Express filtraba por `hotel_id` en cada query). Esto tiene un riesgo: si hay un bug, un endpoint faltante, o acceso directo a la base de datos, un hotel podría leer datos de otro.

Con RLS, **la base de datos misma garantiza el aislamiento**. Aunque el backend tenga un bug y olvide el filtro `WHERE hotel_id = ?`, Postgres devolverá cero filas para ese hotel.

### Tablas protegidas

| Tabla | Cómo se filtra |
|-------|---------------|
| `hotels` | `id = app.hotel_id` |
| `users` | `hotel_id = app.hotel_id` |
| `guests` | `hotel_id = app.hotel_id` |
| `reservations` | `hotel_id = app.hotel_id` |
| `conversations` | `hotel_id = app.hotel_id` |
| `messages` | JOIN a `conversations.hotel_id` |
| `services` | `hotel_id = app.hotel_id` |
| `orders` | `hotel_id = app.hotel_id` |
| `order_items` | JOIN a `orders.hotel_id` |
| `reviews` | `hotel_id = app.hotel_id` |
| `hotel_integrations` | `hotel_id = app.hotel_id` |
| `integration_sync_logs` | `hotel_id = app.hotel_id` |

---

## Cómo aplicarlo en Supabase

### Paso 1 — Abrir el SQL Editor

1. Ir a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**.
2. Crear un nuevo snippet.

### Paso 2 — Ejecutar la migración

Copiar el contenido completo de `migrations/008_rls.sql` y pegarlo en el editor.

> **Nota sobre 001_enable_rls.sql:** La migración 008 reemplaza las políticas creadas en 001 (que usaban `request.jwt.claims` de Supabase Auth). Los `DROP POLICY IF EXISTS` al inicio de cada bloque limpian las políticas viejas automáticamente.

### Paso 3 — Verificar

Ejecutar las queries de verificación incluidas al final del archivo SQL:

```sql
-- Confirmar que RLS está habilitado en todas las tablas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'hotels','users','guests','reservations','conversations','messages',
    'services','orders','reviews','hotel_integrations','integration_sync_logs'
  )
ORDER BY tablename;
```

Todas las filas deben mostrar `rowsecurity = true`.

---

## Cómo el backend setea el contexto

Las políticas RLS leen la variable de sesión `app.hotel_id`. El backend debe setearla **dentro de una transacción** antes de ejecutar queries sobre datos de usuario.

### ¿Por qué dentro de una transacción?

`SET LOCAL` en Postgres limita el valor a la transacción actual. Cuando la transacción termina (COMMIT o ROLLBACK), la variable se resetea automáticamente. Esto es importante para connection pools: si no se usa `LOCAL`, el valor podría "contaminar" la siguiente conexión que el pool reutilice.

### Ejemplo con node-postgres (recomendado)

```js
// utils/dbWithContext.js
const { pool } = require('../database');

/**
 * Ejecuta una query con el hotel_id seteado como contexto RLS.
 * Usa una transacción para garantizar que SET LOCAL se limpie.
 *
 * @param {string} hotelId  - El hotel_id del usuario autenticado (req.user.hotel_id)
 * @param {string} text     - Query SQL
 * @param {Array}  params   - Parámetros de la query
 * @returns {Promise<import('pg').QueryResult>}
 */
async function queryWithHotelContext(hotelId, text, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(key, value, is_local) — is_local = true → dura hasta el COMMIT
    await client.query("SELECT set_config('app.hotel_id', $1, true)", [hotelId]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { queryWithHotelContext };
```

**Uso en un route handler:**

```js
const { queryWithHotelContext } = require('../utils/dbWithContext');

router.get('/guests', auth(), async (req, res) => {
  try {
    const result = await queryWithHotelContext(
      req.user.hotel_id,
      'SELECT * FROM guests ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Ejemplo como middleware Express

Para no repetir el patrón en cada handler, se puede encapsular en un middleware:

```js
// middleware/hotelContext.js
const { pool } = require('../database');

/**
 * Middleware que inyecta req.dbQuery() — una función que ejecuta queries
 * con el hotel_id del usuario JWT como contexto RLS.
 *
 * Debe ir después del middleware auth() para que req.user esté disponible.
 */
const hotelContext = (req, res, next) => {
  const hotelId = req.user?.hotel_id;
  if (!hotelId) {
    return res.status(401).json({ error: 'hotel_id no encontrado en el token' });
  }

  req.dbQuery = async (text, params = []) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.hotel_id', $1, true)", [hotelId]);
      const result = await client.query(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  next();
};

module.exports = hotelContext;
```

**Uso en el router:**

```js
const auth         = require('../middleware/auth');
const hotelContext = require('../middleware/hotelContext');

// Encadenar auth → hotelContext → handler
router.get('/reservations', auth(), hotelContext, async (req, res) => {
  const result = await req.dbQuery(
    'SELECT * FROM reservations WHERE status = $1 ORDER BY check_in',
    ['confirmed']
  );
  res.json(result.rows);
});
```

Notar que el handler ya NO necesita escribir `WHERE hotel_id = $1` — RLS lo aplica automáticamente a nivel de base de datos.

---

## Limitaciones importantes

### 1. El service_role key bypasea RLS

Supabase otorga al `SUPABASE_SERVICE_ROLE_KEY` el rol `service_role` en Postgres, que tiene `BYPASSRLS`. Esto significa que **cualquier query hecha con ese key ignora completamente las políticas RLS**.

El archivo `services/supabaseClient.js` actual usa `SUPABASE_SERVICE_ROLE_KEY`. Esto es correcto para tareas administrativas del backend (sync de integraciones, webhooks de Stripe, procesos internos), pero **no es correcto para queries que ejecuten acciones en nombre de un usuario final**.

**Regla práctica:**

| Escenario | Key a usar |
|-----------|-----------|
| Query de un usuario del hotel (CRUD normal) | `SUPABASE_ANON_KEY` + contexto RLS vía `SET LOCAL` |
| Sync de integración PMS (cross-tenant) | `SUPABASE_SERVICE_ROLE_KEY` |
| Webhook de Stripe | `SUPABASE_SERVICE_ROLE_KEY` |
| Health check / backup | `SUPABASE_SERVICE_ROLE_KEY` |
| Admin panel interno | `SUPABASE_SERVICE_ROLE_KEY` con validación propia |

Para crear un cliente Supabase con anon key:

```js
// services/supabaseUserClient.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUser = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY   // <-- no bypasea RLS
);

module.exports = { supabaseUser };
```

> **Atención:** El cliente Supabase JS (PostgREST) no expone `SET LOCAL` directamente — cada llamada HTTP es sin estado. Para usar RLS con el cliente JS, se necesita enviar el JWT en el header `Authorization: Bearer <token>` y configurar Supabase para leer las claims (lo cual requiere Supabase Auth). La forma más confiable con JWT propio del backend es usar **node-postgres directamente** (como en los ejemplos de arriba) y no el cliente JS.

### 2. `FORCE ROW LEVEL SECURITY` (opcional pero recomendado para tablas críticas)

Por defecto, el propietario de una tabla (el rol `postgres`) también bypasea RLS. Para forzar RLS incluso para el owner:

```sql
ALTER TABLE guests FORCE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;
-- etc.
```

Esto no está en la migración 008 para no romper el flujo de migraciones futuras que usan el rol `postgres`, pero se puede agregar como medida de seguridad adicional en producción.

### 3. La variable `app.hotel_id` no es validada criptográficamente por Postgres

La variable de sesión es un string — Postgres confía en que el backend la setea correctamente. La seguridad descansa en que:

- El backend verifica el JWT firmado con `JWT_SECRET` antes de extraer `hotel_id`.
- El `hotel_id` viene del token verificado, no de la request del cliente.

Nunca usar `req.body.hotel_id` o `req.query.hotel_id` para setear el contexto RLS.

---

## Resumen del flujo completo

```
Cliente HTTP
    │
    │  Authorization: Bearer <JWT>
    ▼
Express auth() middleware
    │  jwt.verify(token, JWT_SECRET)
    │  → req.user = { hotel_id, user_id, role }
    ▼
hotelContext middleware
    │  SET LOCAL app.hotel_id = req.user.hotel_id
    ▼
Postgres RLS
    │  USING (hotel_id = app_hotel_id())
    │  → filtra filas automáticamente
    ▼
Handler devuelve solo datos del hotel autorizado
```
