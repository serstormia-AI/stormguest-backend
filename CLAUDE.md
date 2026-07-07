# CLAUDE.md — stormguest-backend

Express.js API + Supabase backend para StormGuest. Gestiona autenticación legacy (bcrypt/JWT), lógica de integración PMS, bot de chat Julia (OpenAI), y sincronización de datos.

## Commands

```bash
npm start          # Producción (usa NODE_ENV=production)
npm run dev        # Desarrollo con nodemon
```

No test suite. El servidor escucha en `PORT` (default 3000).

---

## Stack

- Node.js + Express
- Supabase JS (service role — bypasses RLS para operaciones de backend)
- OpenAI API (Julia AI concierge)
- JWT (`jsonwebtoken`) para auth legacy
- bcrypt para passwords legacy
- node-cron para sincronización periódica de PMS

---

## Supabase client — `services/supabaseClient.js`

```js
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

El backend siempre usa **service role** — bypassa RLS por diseño. La autorización en el backend se hace vía middleware JWT (`middleware/auth.js`), no via RLS.

**Nunca usar anon key en el backend.** El service role es correcto aquí porque el backend es trusted server-side code.

---

## Auth — `routes/auth.js`

Login endpoint para usuarios legacy (bcrypt). Firma JWT con `{ email, role, hotel_id, name }`.

```
POST /api/auth/login  →  { token, role, hotel_id, name }
```

El frontend intenta Supabase Auth primero; solo cae aquí si el usuario no fue migrado aún. Tras login exitoso, el frontend llama `supabaseAdmin.auth.admin.createUser()` para migrarlo automáticamente.

### `middleware/auth.js`

Verifica el JWT de Express en el header `Authorization: Bearer <token>`. Setea `req.user = { email, role, hotel_id, name }`. **No setea session variables de PostgreSQL** (el patrón `SET app.hotel_id` de migration 008 nunca funcionó por eso).

---

## Migrations — `migrations/`

| # | Archivo | Contenido |
|---|---------|-----------|
| 001–007 | Setup inicial | Schema, tablas base |
| 008 | `008_rls.sql` | RLS legacy con `app_hotel_id()` + `current_setting` — **NO FUNCIONA** con PostgREST (cada request es nueva conexión, session variable nunca se setea) |
| 009 | — | — |
| 010 | — | — |
| 011 | `011_conversations_rls.sql` | Policy `guests_read_own_conversations` para anon/guest |
| 012 | `012_conversation_mode.sql` | Agrega columna `mode` (text, default 'bot') a conversations |
| 013 | `013_rls_auth_uid.sql` | **RLS real** con `auth.uid()` — aplicada 2026-07-06 |

### Migration 013 — RLS definitivo

Reemplaza migration 008. Funciona con PostgREST porque `auth.uid()` se inyecta automáticamente del JWT en cada request HTTP.

Dos funciones helper:

```sql
staff_hotel_id() RETURNS text   -- SELECT hotel_id FROM users WHERE auth_user_id = auth.uid()
is_super_admin() RETURNS bool   -- EXISTS(SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'super_admin')
```

**Por qué `RETURNS text`:** `users.hotel_id` es `TEXT` en este schema. Patrón de comparación universal: `hotel_id::text = staff_hotel_id()` — funciona tanto para columnas uuid como text.

Políticas aplicadas a 13 tablas: hotels, users, guests, reservations, conversations, messages, experiences, requests, services, orders, order_items, reviews, hotel_integrations, integration_sync_logs.

**Políticas legacy eliminadas al ejecutar 013:** las `_v2` de migration 008. Además se dropearon manualmente: `"Allow all"` en hotels, experiences, requests (eran security holes de desarrollo).

---

## Routes

| Ruta | Archivo | Descripción |
|------|---------|-------------|
| `POST /api/auth/login` | `routes/auth.js` | Login bcrypt legacy |
| `GET /api/guests` | `routes/guests.js` | Guests del hotel (por hotel_id del JWT) |
| `GET /api/settings` | `routes/settings.js` | Config del hotel (SMTP, Stripe) |
| `PUT /api/settings` | `routes/settings.js` | Actualizar config |
| `POST /api/settings/test-notification` | `routes/settings.js` | Test email |
| `POST /api/integrations/csv` | `routes/integrations.js` | Import CSV reservas |
| `POST /api/integrations/ical` | `routes/integrations.js` | Guardar URL iCal |
| `POST /api/integrations/ical/sync` | `routes/integrations.js` | Sync iCal ahora |
| `POST /api/integrations/webhook/:slug` | `routes/integrations.js` | Recibir webhook PMS |
| `POST /api/integrations/webhook-config` | `routes/integrations.js` | Configurar webhook |
| `POST /api/integrations/polling` | `routes/integrations.js` | Configurar API polling |
| `POST /api/integrations/poll/:id` | `routes/integrations.js` | Ejecutar polling ahora |

Todas las rutas (excepto webhook entrante y login) requieren JWT válido vía `middleware/auth.js`.

---

## Bot Julia — `services/chatBot.js`

Escucha nuevas conversaciones en Realtime via Supabase. Cuando llega un mensaje de un huésped y `conversation.mode = 'bot'`, genera una respuesta con OpenAI GPT-4o usando el `concierge_personality` del hotel + `hotel_info` (horarios, WiFi, FAQ, etc.).

```js
// Trigger automático
supabase.channel('new-messages').on('postgres_changes', { 
    event: 'INSERT', table: 'messages'
}, handleNewMessage).subscribe();
```

Setea `mode = 'human'` en la conversación si el staff responde, para pausar el bot.

---

## Cron jobs — `server.js`

```js
// iCal sync cada hora
cron.schedule('0 * * * *', syncAllIcalIntegrations);

// API polling cada 15 minutos
cron.schedule('*/15 * * * *', pollAllApiIntegrations);
```

---

## Environment variables requeridas

```
SUPABASE_URL                    # URL del proyecto
SUPABASE_SERVICE_ROLE_KEY       # Service role key (empieza con sb_secret_ en proyectos nuevos)
JWT_SECRET                      # Secret para firmar JWTs legacy
OPENAI_API_KEY                  # Para Julia AI
PORT                            # Puerto del servidor (default 3000)
CORS_ORIGIN                     # URL del frontend (para CORS)
ENCRYPTION_KEY                  # AES-256-GCM para credentials PMS — PENDIENTE configurar
```

**Estado pendiente:** `ENCRYPTION_KEY` no está configurado en producción (ver `docs/status.md`). Las credenciales de PMS (API keys de Cloudbeds/Apaleo) se guardan sin encriptar hasta que se configure.

---

## Schema — columnas de tipo inesperado

Verificado del schema real (relevante para queries del backend):

- `users.hotel_id` → **TEXT**
- `guests.hotel_id` → **TEXT** (confirmado en migration 014)
- `conversations.hotel_id` → **TEXT**
- `reviews.hotel_id` → **TEXT**
- `hotel_integrations.hotel_id` → **TEXT**
- `integration_sync_logs.hotel_id` → **TEXT**
- Resto de tablas (`reservations`, `experiences`, `requests`, etc.) → `hotel_id` es **uuid**

El backend usa service role así que no le afecta RLS, pero es importante para comparaciones correctas en queries.
