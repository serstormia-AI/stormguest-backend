# StormGuest — Arquitectura

## Diagrama de sistema

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTES                              │
│                                                              │
│  [App Huésped]        [Dashboard Admin]      [WhatsApp]      │
│  Next.js 16           React + Vite           Twilio          │
│  Vercel               Vercel                 (webhook)       │
└──────────┬────────────────────┬─────────────────┬───────────┘
           │  HTTPS             │  HTTPS          │  POST /webhook/twilio
           ▼                    ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│                    stormguest-backend                         │
│                    Express 5 — Railway                        │
│                                                              │
│  /api/auth          /api/chat            /api/payments        │
│  /api/reservations  /api/messages        /api/reviews         │
│  /api/services      /api/orders          /api/settings        │
│  /api/integrations  /api/webhook/twilio  /api/admin           │
│  /api/guests        /api/notifications   /api/integrations/health│
│                                                              │
│  Middleware: auth (JWT) → hotel_id + role                    │
│  Crons: iCal (1h), API polling (15m), purge logs (mes)       │
└──────┬────────────┬──────────────────┬───────────────────────┘
       │            │                  │
       ▼            ▼                  ▼
  [Supabase]   [Anthropic]        [Twilio]
  PostgreSQL   Claude AI          WhatsApp Out
  Realtime     (respuestas IA)
```

## Flujo de datos — Chat en tiempo real

```
Huésped escribe mensaje
    ↓
App (Next.js) → POST /api/messages { content, conversation_id }
    ↓
Backend guarda en messages table
    ↓
Supabase Realtime emite el cambio
    ↓ (suscripción)                    ↓ (suscripción)
App Huésped recibe nuevo mensaje   Dashboard Admin recibe nuevo mensaje
    ↓
Backend (async) → Anthropic Claude
    ↓
Claude genera respuesta con system_prompt del hotel
    ↓
Backend guarda respuesta en messages table
    ↓
Supabase Realtime emite → ambos clientes reciben la respuesta IA
```

## Flujo de datos — PMS Integration

```
Hotel configura integración (CSV / iCal / Webhook / API)
    ↓
stormguest-frontend → POST /api/integrations (type, provider, config)
    ↓
Backend guarda en hotel_integrations table

OPCIONES DE SYNC:
A. CSV:     POST /api/integrations/import/csv → multer → papaparse → upsert por external_uid
B. iCal:    node-cron (cada hora) → fetch URL → ical.js → upsert por external_uid
C. Webhook: PMS envía POST /api/integrations/webhook/:hotel_slug → HMAC-SHA256 → normalizer → upsert
D. Polling: node-cron (cada 15 min) → CloudbedsClient / ApaleoClient → upsert

Todos los caminos escriben en:
  - reservations (upsert por external_uid + hotel_id)
  - integration_sync_logs (acción, resultado, detalle)
```

## Estructura de directorios

```
stormguest-backend/
├── server.js                  # Entry point, registra rutas y crons
├── middleware/
│   └── auth.js                # JWT verify → req.user = { hotel_id, role, user_id }
├── routes/
│   ├── auth.js                # POST /login, POST /register
│   ├── reservations.js        # CRUD reservaciones
│   ├── guests.js              # CRUD huéspedes
│   ├── messages.js            # GET/POST mensajes de chat
│   ├── services.js            # CRUD catálogo de servicios
│   ├── orders.js              # CRUD órdenes
│   ├── reviews.js             # GET/POST/PUT valoraciones
│   ├── payments.js            # Stripe checkout (por hotel)
│   ├── settings.js            # GET/PUT configuración del hotel
│   ├── integrations.js        # PMS: CSV, iCal, webhook, polling
│   ├── notifications.js       # GET/POST notificaciones
│   ├── webhook.js             # POST /webhook/twilio (WhatsApp entrante)
│   └── admin.js               # Super admin: CRUD hoteles y usuarios
├── services/
│   ├── claudeAI.js            # Anthropic SDK — genera respuestas IA
│   ├── crypto.js              # AES-256-GCM encrypt/decrypt
│   ├── icalSync.js            # Cron + sync de iCal feeds
│   ├── apiPolling.js          # Cron + polling Cloudbeds/Apaleo
│   ├── maintenance.js         # Cron mensual — purge de logs viejos
│   └── pms-clients/
│       ├── cloudbeds.js       # CloudbedsClient + normalizers
│       └── apaleo.js          # ApaleoClient (OAuth CC) + normalizers
├── migrations/                # SQL para ejecutar en Supabase SQL Editor
│   ├── 001_initial.sql
│   ├── 002_services.sql
│   ├── 003_reviews.sql
│   ├── 004_hotel_settings.sql
│   ├── 005_integrations.sql
│   ├── 006_sync_logs.sql
│   └── 007_stripe_per_hotel.sql
├── __tests__/                 # Jest + supertest
│   ├── auth.test.js
│   ├── reviews.test.js
│   ├── integrations.test.js
│   ├── settings.test.js
│   ├── webhook.test.js
│   └── rbac.test.js
├── docs/                      # Esta documentación
├── Dockerfile                 # node:20-alpine
├── .env.example               # Variables requeridas con instrucciones
└── .github/workflows/ci.yml   # Tests → Docker build
```

## Schema de base de datos (tablas principales)

```sql
hotels          (id, name, slug, system_prompt, smtp_*, stripe_*_enc, stripe_publishable_key)
users           (id, hotel_id, email, password_hash, role)
guests          (id, hotel_id, name, email, phone, whatsapp_number)
reservations    (id, hotel_id, guest_id, room_number, check_in, check_out, status, external_uid, external_source)
conversations   (id, hotel_id, guest_id, reservation_id, channel, status)
messages        (id, conversation_id, hotel_id, sender_type, content, created_at)
services        (id, hotel_id, name, description, price, category, active)
orders          (id, hotel_id, guest_id, reservation_id, status, total)
order_items     (id, order_id, service_id, quantity, unit_price)
reviews         (id, hotel_id, guest_id, reservation_id, rating, comment, responded, response_text)
hotel_integrations (id, hotel_id, type, provider, active, config JSONB, last_sync, last_error)
integration_sync_logs (id, integration_id, hotel_id, synced_at, source, event_type, external_id, action, detail JSONB)
```

## RBAC — Matriz de acceso

| Ruta | reception | hotel_manager | super_admin |
|------|:---------:|:-------------:|:-----------:|
| /checkins | ✅ | ✅ | ✅ |
| /chat | ✅ | ✅ | ✅ |
| /requests | ✅ | ✅ | ✅ |
| /orders | ✅ | ✅ | ✅ |
| /catalog | ❌ | ✅ | ✅ |
| /reviews | ❌ | ✅ | ✅ |
| /notifications | ❌ | ✅ | ✅ |
| /settings | ❌ | ✅ | ✅ |
| /integrations | ❌ | ✅ | ✅ |
| / (dashboard) | ❌ | ✅ | ✅ |
| /admin | ❌ | ❌ | ✅ |

## Cifrado de credenciales por hotel

Las credenciales sensibles (Stripe secret key, Stripe webhook secret, PMS API keys) se cifran con AES-256-GCM antes de guardar en la DB:

```
plaintext → services/crypto.js → { iv, data, tag } → JSONB en Supabase
```

La clave de cifrado es `ENCRYPTION_KEY` (32 bytes hex) — debe estar en las variables de entorno de Railway. Sin esta clave, las credenciales por hotel no funcionan.

## Autenticación

```
POST /api/auth/login { email, password }
→ bcrypt.compare(password, hash)
→ jwt.sign({ hotel_id, user_id, role }, JWT_SECRET, { expiresIn: '7d' })
→ { token }

Requests autenticadas:
Authorization: Bearer <token>
→ middleware/auth.js verifica firma
→ req.user = { hotel_id, user_id, role }
→ todas las queries usan .eq('hotel_id', req.user.hotel_id)
```
