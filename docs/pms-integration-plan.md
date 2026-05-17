# Plan de Integración PMS — StormGuest

**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Audiencia:** Equipo técnico StormGuest

---

## 1. Panorama de PMS más usados en LATAM / Argentina

| PMS | Segmento | Tipo de API | Formato | Webhooks | iCal | Facilidad (1-5) | Notas |
|---|---|---|---|---|---|---|---|
| **Opera (Oracle)** | Enterprise, cadenas grandes | REST (OHIP) | JSON/REST | Sí | No | 2 | Requiere contrato con Oracle; sandbox de pago; documentación extensa |
| **Cloudbeds** | Boutiques y medianos | REST completa | JSON/REST | Sí | Sí | 5 | Mejor opción en el target market; sandbox gratuito; docs excelentes |
| **Apaleo** | Cloud-native, en crecimiento | REST / GraphQL | JSON/REST | Sí | No | 4 | API-first desde el día 1; modelo de apps marketplace |
| **Beds24** | Económico, flexible | REST + iCal | JSON/REST + iCal | Limitado | Sí | 3 | iCal es el método más usado; API existe pero menos documentada |
| **Little Hotelier** | Pequeños (< 20 hab.) | Limitada | iCal | No | Sí | 3 | La mayoría exporta solo iCal; sin acceso directo a guest data |
| **Hotelería.net y similares** | LATAM local, SMB | Sin API | CSV/Excel | No | No | 1 | Exportación manual; integración solo por CSV |

**Recomendación de prioridad:** Cloudbeds primero (mayor adopción en el segmento objetivo), luego Apaleo (API más limpia), luego iCal genérico para el resto.

---

## 2. Estrategias de integración

Las estrategias están ordenadas de menor a mayor complejidad técnica. Un hotel puede usar más de una simultáneamente.

---

### A) Import manual CSV

**Cuándo usarlo:** Hoteles pequeños, PMS locales sin API, arranque inicial de cualquier hotel.

**Flujo:**
1. El hotel exporta sus reservas desde el PMS en CSV (cualquier formato).
2. Sube el archivo a StormGuest desde el panel admin.
3. StormGuest parsea y mapea las columnas al schema interno.
4. Crea o actualiza `guests` y `reservations` en Supabase.

**Endpoint:**
```
POST /api/integrations/import/csv
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Columnas soportadas (case-insensitive, aliases incluidos):**

| Campo interno | Aliases aceptados en CSV |
|---|---|
| `name` | nombre, nombre_huesped, guest_name, huesped |
| `email` | correo, email, mail |
| `phone` | telefono, celular, phone, tel |
| `room_number` | habitacion, room, cuarto, nro_hab |
| `check_in` | entrada, checkin, check_in, arrival |
| `check_out` | salida, checkout, check_out, departure |
| `notes` | notas, comments, observaciones |

**Respuesta:**
```json
{
  "created": 42,
  "updated": 5,
  "skipped": 1,
  "errors": [
    { "row": 7, "reason": "check_in inválido: '32/13/2026'" }
  ]
}
```

**Validaciones mínimas:** `check_in` y `check_out` son obligatorios y deben ser fechas válidas. El resto es opcional.

**Implementación (pseudocódigo):**
```js
// routes/integrations/csv-import.js
import multer from 'multer';
import Papa from 'papaparse';

router.post('/import/csv', upload.single('file'), async (req, res) => {
  const { hotel_id } = req.user; // del JWT
  const csv = req.file.buffer.toString('utf8');
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });

  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [i, row] of data.entries()) {
    try {
      const normalized = normalizeRow(row); // mapea aliases
      if (!normalized.check_in || !normalized.check_out) {
        results.errors.push({ row: i + 2, reason: 'check_in y check_out son obligatorios' });
        continue;
      }
      await upsertReservation(hotel_id, normalized, results);
    } catch (err) {
      results.errors.push({ row: i + 2, reason: err.message });
    }
  }

  res.json(results);
});
```

---

### B) iCal Sync

**Cuándo usarlo:** Beds24, Little Hotelier, Booking.com, Airbnb, cualquier PMS que exporte iCal.

**Limitación importante:** iCal contiene fecha, habitación y resumen de texto — NO contiene email ni teléfono del huésped. Se crea la reserva con datos mínimos; el hotel completa el perfil del huésped manualmente o por otro canal.

**Flujo:**
1. El hotel copia su URL iCal desde su PMS.
2. La pega en la configuración de integración en el panel admin de StormGuest.
3. Un cron job corre cada hora, lee el iCal y sincroniza reservas.

**Dependencia:** `node-cron` (ya instalado) + `ical.js` (agregar).

```bash
npm install ical.js
```

**Implementación:**
```js
// services/ical-sync.js
import cron from 'node-cron';
import ical from 'ical.js';
import fetch from 'node-fetch';
import { supabase } from '../database.js';

// Corre cada hora
cron.schedule('0 * * * *', async () => {
  const { data: integrations } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('type', 'ical')
    .eq('active', true);

  for (const integration of integrations) {
    try {
      await syncIcal(integration);
      await supabase
        .from('hotel_integrations')
        .update({ last_sync: new Date().toISOString(), last_error: null })
        .eq('id', integration.id);
    } catch (err) {
      await supabase
        .from('hotel_integrations')
        .update({ last_error: err.message })
        .eq('id', integration.id);
    }
  }
});

async function syncIcal(integration) {
  const { hotel_id, config } = integration;
  const res = await fetch(config.ical_url);
  const text = await res.text();
  const cal = new ical.Component(ical.parse(text));
  const events = cal.getAllSubcomponents('vevent');

  for (const event of events) {
    const uid = event.getFirstPropertyValue('uid');
    const summary = event.getFirstPropertyValue('summary') || 'Sin nombre';
    const dtstart = event.getFirstPropertyValue('dtstart');
    const dtend = event.getFirstPropertyValue('dtend');

    // Upsert por uid externo para evitar duplicados
    await supabase.from('reservations').upsert({
      hotel_id,
      external_uid: uid,
      notes: summary,
      check_in: dtstart.toJSDate().toISOString(),
      check_out: dtend.toJSDate().toISOString(),
      status: 'pending',
    }, { onConflict: 'external_uid' });
  }
}
```

**Nota:** Agregar columna `external_uid TEXT` a la tabla `reservations` para manejar el upsert sin duplicados.

---

### C) Webhook entrante (push desde el PMS)

**Cuándo usarlo:** Cloudbeds, Apaleo, cualquier PMS que soporte webhooks salientes.

**Flujo:**
1. El hotel configura en su PMS un webhook apuntando a:  
   `POST https://api.stormguest.com/api/integrations/webhook/:hotel_slug`
2. El PMS envía eventos en tiempo real.
3. StormGuest valida el HMAC, normaliza el payload y actualiza la base de datos.

**Eventos soportados:**
- `reservation.created`
- `reservation.updated`
- `reservation.cancelled`
- `guest.checkin`
- `guest.checkout`

**Implementación:**
```js
// routes/integrations/webhook.js
import crypto from 'crypto';

router.post('/webhook/:hotel_slug', express.raw({ type: 'application/json' }), async (req, res) => {
  // Responder 200 siempre para que el PMS no reintente innecesariamente
  res.sendStatus(200);

  const { hotel_slug } = req.params;

  // Buscar hotel e integración
  const { data: hotel } = await supabase
    .from('hotels')
    .select('id')
    .eq('slug', hotel_slug)
    .single();

  if (!hotel) return; // ya respondimos 200, solo salimos

  const { data: integration } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('hotel_id', hotel.id)
    .eq('type', 'webhook')
    .eq('active', true)
    .single();

  if (!integration) return;

  // Validar HMAC
  const secret = integration.config.webhook_secret;
  const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'];
  if (!validateHmac(req.body, secret, signature)) {
    console.warn(`[webhook] HMAC inválido para hotel ${hotel_slug}`);
    return;
  }

  const payload = JSON.parse(req.body.toString());
  const provider = integration.provider;

  // Normalizar según provider
  const normalized = normalizeWebhookPayload(provider, payload);
  await processWebhookEvent(hotel.id, normalized);
});

function validateHmac(body, secret, signature) {
  if (!secret || !signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

**Normalizador por provider:**
```js
// services/webhook-normalizer.js
export function normalizeWebhookPayload(provider, payload) {
  switch (provider) {
    case 'cloudbeds':
      return {
        event: payload.action, // 'reservation_created', etc.
        external_id: payload.reservation?.id,
        guest_name: payload.reservation?.guestName,
        guest_email: payload.reservation?.guestEmail,
        guest_phone: payload.reservation?.guestPhone,
        room_number: payload.reservation?.roomNumber,
        check_in: payload.reservation?.startDate,
        check_out: payload.reservation?.endDate,
        status: mapCloudbedsStatus(payload.reservation?.status),
      };
    case 'apaleo':
      return {
        event: payload.type,
        external_id: payload.booking?.id,
        guest_name: `${payload.booking?.primaryGuest?.firstName} ${payload.booking?.primaryGuest?.lastName}`,
        guest_email: payload.booking?.primaryGuest?.email,
        guest_phone: payload.booking?.primaryGuest?.phone,
        room_number: payload.booking?.reservations?.[0]?.unit?.name,
        check_in: payload.booking?.reservations?.[0]?.arrival,
        check_out: payload.booking?.reservations?.[0]?.departure,
        status: mapApaleoStatus(payload.booking?.status),
      };
    default:
      return payload; // custom / pass-through
  }
}
```

---

### D) API Polling (pull desde StormGuest)

**Cuándo usarlo:** Opera (OHIP), PMS con API REST pero sin webhooks.

**Flujo:**
1. El hotel provee sus credenciales API en el panel de configuración.
2. StormGuest las guarda encriptadas en `hotel_integrations.config`.
3. Un cron corre cada 15 minutos, consulta la API del PMS y reconcilia diferencias.

**Cron:**
```js
// services/api-polling.js
cron.schedule('*/15 * * * *', async () => {
  const { data: integrations } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('type', 'api_polling')
    .eq('active', true);

  for (const integration of integrations) {
    await pollPms(integration);
  }
});

async function pollPms(integration) {
  const { hotel_id, provider, config } = integration;
  const client = getPmsClient(provider, config); // factory por provider

  // Rango: últimos 30 días + próximos 90
  const from = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const to = dayjs().add(90, 'day').format('YYYY-MM-DD');

  const remoteReservations = await client.getReservations({ from, to });
  const { data: localReservations } = await supabase
    .from('reservations')
    .select('external_id, status, updated_at')
    .eq('hotel_id', hotel_id);

  const localMap = new Map(localReservations.map(r => [r.external_id, r]));

  for (const remote of remoteReservations) {
    const local = localMap.get(remote.id);
    if (!local || local.status !== remote.status) {
      await upsertFromRemote(hotel_id, remote);
    }
  }
}
```

**Consideraciones:**
- Rate limiting: respetar los límites de la API del PMS (Opera: 60 req/min).
- Exponential backoff en errores 429 o 5xx.
- Guardar `last_sync` y `last_error` en `hotel_integrations`.

---

### E) Channel Manager

**Cuándo usarlo:** Hoteles que distribuyen en múltiples canales (Booking.com, Expedia, Airbnb).

**Providers relevantes:** SiteMinder, Cloudbeds Channel Manager, RateGain, D-EDGE.

**Estrategia:** No integrar canal por canal. Conectarse al channel manager que ya consolida todo. La integración es igual a la estrategia C (webhook) o D (polling), pero apuntando al channel manager en lugar del PMS.

**Ventaja:** Una sola integración cubre N canales de distribución.

---

## 3. Diseño técnico

### 3.1 Tabla `hotel_integrations`

```sql
CREATE TABLE hotel_integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('ical', 'webhook', 'api_polling', 'manual')),
  provider    TEXT,         -- 'cloudbeds', 'apaleo', 'beds24', 'opera', 'custom'
  config      JSONB DEFAULT '{}',
  -- config contiene según el tipo:
  -- ical:        { ical_url }
  -- webhook:     { webhook_secret }
  -- api_polling: { api_key_enc, api_url, client_id_enc }
  -- manual:      {}
  active      BOOLEAN DEFAULT true,
  last_sync   TIMESTAMPTZ,
  last_error  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para los crons
CREATE INDEX idx_hotel_integrations_type_active
  ON hotel_integrations(type, active)
  WHERE active = true;
```

**Nunca guardar API keys en texto plano.** Ver sección 6 (Seguridad).

### 3.2 Columna `external_uid` en `reservations`

```sql
ALTER TABLE reservations
  ADD COLUMN external_uid TEXT,
  ADD COLUMN external_source TEXT; -- 'cloudbeds', 'apaleo', 'ical', etc.

CREATE UNIQUE INDEX idx_reservations_external_uid
  ON reservations(hotel_id, external_uid)
  WHERE external_uid IS NOT NULL;
```

Esto permite hacer upsert idempotente desde cualquier fuente sin duplicar reservas.

### 3.3 Rutas nuevas

```
POST /api/integrations/import/csv          — import manual
POST /api/integrations/webhook/:hotel_slug — webhook entrante (cualquier provider)
GET  /api/integrations/:hotel_id           — listar integraciones del hotel
POST /api/integrations/:hotel_id           — crear/actualizar integración
DELETE /api/integrations/:id               — desactivar integración
GET  /api/integrations/:id/sync-log        — historial de sincronizaciones
```

### 3.4 Estructura de directorios sugerida

```
stormguest-backend/
├── routes/
│   └── integrations/
│       ├── index.js          — router principal
│       ├── csv-import.js     — estrategia A
│       └── webhook.js        — estrategia C
├── services/
│   ├── ical-sync.js          — estrategia B (cron)
│   ├── api-polling.js        — estrategia D (cron)
│   ├── webhook-normalizer.js — mapeo por provider
│   └── pms-clients/
│       ├── cloudbeds.js
│       ├── apaleo.js
│       └── opera.js
└── docs/
    └── pms-integration-plan.md
```

---

## 4. Flujo de onboarding de un hotel nuevo

```
1. Super admin crea el hotel en StormGuest
   → Genera hotel.id y hotel.slug

2. Pregunta al hotel: ¿qué PMS usás?
   → Muestra lista: Cloudbeds / Apaleo / Beds24 / Little Hotelier / Otro / Sin PMS

3. Según la respuesta, configura la integración:
   ┌─────────────────┬──────────────────────────────────────────┐
   │ PMS             │ Acción                                   │
   ├─────────────────┼──────────────────────────────────────────┤
   │ Cloudbeds       │ Configurar webhook + credenciales API    │
   │ Apaleo          │ Configurar webhook + OAuth               │
   │ Beds24          │ Pegar URL iCal                           │
   │ Little Hotelier │ Pegar URL iCal                           │
   │ Local / CSV     │ Subir CSV de reservas actuales           │
   │ Sin PMS         │ Carga manual desde panel                 │
   └─────────────────┴──────────────────────────────────────────┘

4. Import inicial:
   → Subir CSV de reservas actuales + historial (últimos 90 días mínimo)
   → Esto pobla guests y reservations con datos reales antes del go-live

5. Sync automática activa según tipo:
   → iCal: cron cada hora
   → Webhook: en tiempo real
   → API polling: cron cada 15 min

6. El hotel empieza a usar StormGuest con contexto real de reservas
   → Chat / WhatsApp con hotel_id como nexo de toda la información
```

---

## 5. Roadmap de implementación

| Sprint | Duración | Entregables | Prioridad |
|---|---|---|---|
| **Sprint 1** | 2 semanas | Import CSV + endpoint webhook genérico + tabla `hotel_integrations` | Alta |
| **Sprint 2** | 2 semanas | iCal sync con cron + UI en panel admin para configurar integraciones | Alta |
| **Sprint 3** | 3 semanas | Integración Cloudbeds completa (webhook + polling) + normalizer | Alta |
| **Sprint 4** | 3 semanas | Integración Apaleo + API polling genérico + sync log UI | Media |
| **Futuro** | TBD | Opera (requiere contrato Oracle) + channel managers (SiteMinder, RateGain) | Baja |

**Criterio de "hecho" por sprint:**
- Código con tests unitarios para el normalizer y el import
- Integración probada end-to-end con cuenta sandbox del PMS
- Documentación de configuración para el equipo de onboarding

---

## 6. Seguridad

### 6.1 Encriptación de credenciales

Las API keys del PMS no van en texto plano en la columna `config`. Se encriptan con AES-256-GCM antes de guardar en Supabase.

```js
// services/crypto.js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes, en .env

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decrypt(encryptedObj) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(encryptedObj.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedObj.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedObj.data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
```

Guardar en config:
```json
{
  "api_key_enc": { "iv": "...", "data": "...", "tag": "..." },
  "api_url": "https://api.cloudbeds.com"
}
```

`ENCRYPTION_KEY` solo existe en variables de entorno del servidor, nunca en el repositorio.

### 6.2 Validación de webhooks entrantes

Todo webhook entrante se valida con HMAC-SHA256 antes de procesar el payload (ver implementación en sección 2C). Si el HMAC no coincide, se ignora silenciosamente (pero se loguea).

### 6.3 Audit log de sincronizaciones

```sql
CREATE TABLE integration_sync_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES hotel_integrations(id),
  hotel_id     TEXT NOT NULL,
  synced_at    TIMESTAMPTZ DEFAULT now(),
  source       TEXT,          -- 'ical', 'webhook', 'csv', 'polling'
  event_type   TEXT,          -- 'reservation.created', 'reservation.cancelled', etc.
  external_id  TEXT,          -- ID de la reserva en el PMS
  action       TEXT,          -- 'created', 'updated', 'skipped', 'error'
  detail       JSONB          -- diff de cambios o mensaje de error
);

-- Retención: purgar logs > 90 días con un cron mensual
```

### 6.4 Rate limiting en endpoints de integración

Agregar rate limiting específico para los endpoints de webhook e import CSV:

```js
import rateLimit from 'express-rate-limit';

const integrationLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minuto
  max: 100,               // 100 requests por minuto por IP
  message: { error: 'Demasiadas solicitudes' },
});

router.use('/integrations', integrationLimiter);
```

---

## 7. Dependencias a agregar

```bash
npm install ical.js papaparse multer
```

| Paquete | Uso | Ya instalado |
|---|---|---|
| `node-cron` | Crons para iCal y polling | Sí |
| `ical.js` | Parsear feeds iCal | No |
| `papaparse` | Parsear CSV con detección automática | No |
| `multer` | Manejar uploads multipart | No |
| `node-fetch` | HTTP requests a APIs externas | Verificar |

---

*Documento generado como parte del plan técnico de StormGuest. Revisar y actualizar a medida que avancen las integraciones.*
