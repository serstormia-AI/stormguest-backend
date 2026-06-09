# StormGuest — Backend

API REST para StormGuest, plataforma SaaS de gestión hotelera. Maneja autenticación multi-tenant, conversaciones de huéspedes con IA, pedidos de room service, pagos y sincronización de PMS.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Express 5 |
| Base de datos | Supabase (PostgreSQL + Realtime) |
| Auth staff | Supabase Auth (primary) + JWT/bcrypt fallback |
| IA (bot) | Anthropic Claude Haiku |
| Email | Supabase Edge Function + Resend API |
| Pagos | Stripe Checkout |
| PMS sync | iCal, Webhooks, API Polling (Cloudbeds/Apaleo), CSV import |
| Scheduler | node-cron |
| Runtime | Node.js |

---

## Estructura de carpetas

```
stormguest-backend/
├── server.js                   # Punto de entrada, CORS, registro de rutas
├── database.js                 # Inicialización de pg pool
├── routes/
│   ├── auth.js                 # POST /api/auth/login (fallback bcrypt para usuarios legacy)
│   ├── hotels.js               # CRUD de hoteles
│   ├── guests.js               # Listado de huéspedes
│   ├── reservations.js         # Check-ins y reservas
│   ├── services.js             # Catálogo de servicios
│   ├── reviews.js              # Reseñas
│   ├── payments.js             # Stripe Checkout + webhook + órdenes
│   ├── notifications.js        # Legacy — reemplazado por Edge Function send-notification
│   ├── analytics.js            # Métricas del dashboard
│   ├── admin.js                # Super admin: hoteles y usuarios
│   ├── integrations.js         # PMS: iCal sync, webhook, API polling, CSV import
│   └── webhook.js              # WhatsApp webhook
├── middleware/
│   ├── auth.js                 # JWT verify + control de roles
│   └── requireRole.js          # Middleware de roles
├── services/
│   ├── supabaseClient.js       # Instancia Supabase con service role key
│   ├── emailService.js         # Emails transaccionales via Nodemailer (legacy)
│   ├── icalSync.js             # Sincronización iCal
│   ├── apiPolling.js           # Polling API Cloudbeds/Apaleo
│   ├── crypto.js               # AES-256-GCM para credenciales de integración
│   └── scheduler.js            # Tareas programadas (node-cron)
├── migrations/                 # SQL para aplicar en Supabase SQL Editor (en orden)
│   ├── 001_enable_rls.sql
│   ├── 002_services_image_url.sql
│   ├── 003_orders.sql
│   ├── 004_hotel_settings.sql
│   ├── 005_integrations.sql    # hotel_integrations table
│   ├── 006_sync_logs.sql       # integration_sync_logs table
│   ├── 007_stripe_per_hotel.sql
│   └── 008_rls.sql
└── supabase/
    └── functions/
        └── send-notification/  # Edge Function: email via Resend API
            └── index.ts
```

---

## Variables de entorno

Copiá `.env.example` como `.env` y completá los valores:

```bash
cp .env.example .env
```

Variables **obligatorias** para que el servidor arranque:

| Variable | Descripción |
|---|---|
| `JWT_SECRET` | Clave para firmar tokens JWT. Generá con `openssl rand -hex 64` |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (acceso completo, solo en backend) |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma (requerido en `NODE_ENV=production`) |

El resto son opcionales según las funciones que uses: ver `.env.example` para descripción completa.

---

## Correr en local

```bash
npm install
cp .env.example .env
# Editá .env con tus valores reales
node server.js
```

El servidor escucha en `http://localhost:8080` (o el puerto que definas en `PORT`).

---

## Autenticación y roles

### Flujo principal (Supabase Auth)

El frontend usa `supabase.auth.signInWithPassword()` directamente. El Express `POST /api/auth/login` es un **fallback** para usuarios legacy que aún tienen contraseña bcrypt en la tabla `users`.

**Migración automática:** cuando un usuario legacy entra por Express, el frontend crea automáticamente su cuenta en Supabase Auth en background. Próximo login va directo por Supabase Auth.

### Tabla `users`

Staff users en Supabase:

| Campo | Descripción |
|-------|-------------|
| `id` | UUID |
| `name`, `email` | Datos del usuario |
| `password_hash` | Bcrypt hash (legacy) o `'supabase_auth'` (nuevo flujo) |
| `role` | `'super_admin'` \| `'hotel_manager'` \| `'reception'` |
| `hotel_id` | UUID del hotel asignado (null para super_admin) |

**Crear usuarios:** el SuperAdmin del frontend usa `supabaseAdmin.auth.admin.inviteUserByEmail()` o `createUser()` directamente. No pasa por Express. Las rutas `/api/admin/users` solo se usan para lectura en casos legacy.

### JWT payload (Express legacy)

```json
{
  "email": "admin@hotel.com",
  "role": "hotel_manager",
  "hotel_id": "uuid-del-hotel",
  "name": "Admin Hotel"
}
```

---

## Endpoints activos (Express backend)

### Auth (legacy fallback)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login bcrypt — solo para usuarios no migrados a Supabase Auth |

### Integraciones PMS

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/integrations` | Listar integraciones del hotel *(leer directo de Supabase es preferible)* |
| POST | `/api/integrations/import/csv` | Importar reservas desde CSV |
| POST | `/api/integrations/ical` | Guardar URL iCal y configurar sync automático |
| POST | `/api/integrations/ical/sync` | Disparar sync iCal inmediata |
| POST | `/api/integrations/webhook-config` | Configurar webhook de PMS |
| POST | `/api/integrations/polling` | Configurar API polling (Cloudbeds/Apaleo) |
| POST | `/api/integrations/:id/poll` | Disparar polling manual |
| GET | `/api/integrations/:id/logs` | Logs de sync *(leer directo de Supabase es preferible)* |
| DELETE | `/api/integrations/:id` | Eliminar integración *(directo a Supabase es preferible)* |

### Pagos (Stripe)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/payments/checkout` | Crear sesión Stripe Checkout |
| POST | `/api/payments/webhook` | Webhook Stripe (body raw) |

### Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |

---

## Edge Function — send-notification

Reemplaza las rutas `/api/notifications/*`. Envía emails via **Resend API** (sin SMTP, sin Railway).

**Deploy:**
```bash
supabase login
supabase functions deploy send-notification --project-ref <PROJECT_REF>
```

**Secrets requeridos** (Supabase Dashboard → Edge Functions → send-notification → Secrets):

| Secret | Descripción |
|--------|-------------|
| `RESEND_API_KEY` | API key de resend.com (free tier: 3000/mes) |
| `EMAIL_FROM` | Dirección remitente, ej: `StormGuest <notificaciones@tuhotel.com>` |

**Modos de uso:**

```json
// Email a huésped
{ "guest_id": "uuid", "subject": "Asunto", "message": "Texto", "hotel_id": "slug-o-uuid" }

// Email de prueba
{ "test": true, "to": "staff@hotel.com" }
```

---

## Arquitectura multi-tenant

Cada request autenticado expone `req.user.hotel_id` (UUID). Las consultas a Supabase filtran siempre por `hotel_id`.

Supabase tiene RLS habilitado en todas las tablas (ver `migrations/008_rls.sql`). El backend usa `service_role_key` (bypasa RLS) y aplica el filtro por `hotel_id` en cada query.

---

## Migraciones

Los archivos SQL en `/migrations/` se aplican manualmente en orden:

1. Abrí tu proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor**
3. Ejecutar cada archivo en orden (`001_` → `008_`)

---

## Deploy en Railway

1. Crear nuevo proyecto en [railway.app](https://railway.app)
2. Conectar el repositorio de GitHub
3. Agregar las variables de entorno en **Settings → Variables**
4. Railway detecta automáticamente Node.js y ejecuta `node server.js`

`PORT` no debe fijarse — Railway lo inyecta automáticamente.
