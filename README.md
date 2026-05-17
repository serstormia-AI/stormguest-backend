# StormGuest — Backend

API REST para StormGuest, plataforma SaaS de gestión hotelera. Maneja autenticación multi-tenant, conversaciones de huéspedes por WhatsApp con IA, pedidos de room service, pagos y notificaciones.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Express 5 |
| Base de datos | Supabase (PostgreSQL + Realtime) |
| Auth | JWT + bcrypt |
| IA (bot) | OpenAI API (conversaciones) + Anthropic Claude (mensajes automáticos) |
| WhatsApp | Twilio / Evolution API / Meta Business API |
| Email | Nodemailer (SMTP) |
| Pagos | Stripe Checkout |
| Scheduler | node-cron |
| Runtime | Node.js |

---

## Estructura de carpetas

```
stormguest-backend/
├── server.js              # Punto de entrada, configuración CORS, registro de rutas
├── database.js            # Inicialización de pg pool
├── routes/
│   ├── auth.js            # POST /api/auth/login
│   ├── hotels.js          # CRUD de hoteles, QR WhatsApp
│   ├── guests.js          # Listado de huéspedes con estado de conversación
│   ├── reservations.js    # Check-ins y reservas
│   ├── services.js        # Catálogo de servicios del hotel
│   ├── reviews.js         # Reseñas de huéspedes
│   ├── payments.js        # Stripe Checkout + webhook + órdenes
│   ├── notifications.js   # Envío manual de emails a huéspedes
│   ├── analytics.js       # Métricas del dashboard
│   └── webhook.js         # Entrada de mensajes WhatsApp (Twilio)
├── middleware/
│   └── auth.js            # JWT verify + control de roles
├── services/
│   ├── supabaseClient.js  # Instancia Supabase con service role key
│   ├── claudeAI.js        # Generación de respuestas con OpenAI
│   ├── chatBot.js         # Listener Supabase Realtime para el bot
│   ├── whatsapp.js        # Abstracción multi-proveedor WhatsApp
│   ├── twilioService.js   # Envío via Twilio
│   ├── evolutionAPI.js    # Integración Evolution API
│   ├── emailService.js    # Emails transaccionales (Nodemailer)
│   └── scheduler.js       # Tareas programadas (node-cron + Anthropic)
└── migrations/
    ├── 001_enable_rls.sql
    ├── 002_services_image_url.sql
    ├── 003_orders.sql
    └── 004_hotel_settings.sql
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

## Endpoints principales

### Auth

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Login con email + password, retorna JWT | No |

### Hoteles

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/hotels` | Listar todos los hoteles | `super_admin` |
| GET | `/api/hotels/:id` | Obtener hotel por ID | `super_admin`, `hotel_manager` (solo su hotel) |
| POST | `/api/hotels` | Crear hotel + instancia WhatsApp opcional | `super_admin` |
| GET | `/api/hotels/:id/qr` | Página HTML con QR de WhatsApp (sin auth) | No |

### Huéspedes

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/guests` | Listar huéspedes del hotel con estado de conversación | JWT |

### Reservas

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/reservations` | Listar reservas. Query param opcional: `?status=in_house` | JWT |

### Servicios (catálogo)

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/services` | Listar servicios activos del hotel. Query param: `?hotel_id=` | JWT |

### Reseñas

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/reviews` | Listar reseñas del hotel | JWT |
| POST | `/api/reviews` | Crear reseña (`guest_id`, `rating` 1–5, `comment`) | JWT |
| DELETE | `/api/reviews/:id` | Eliminar reseña | JWT |

### Analytics

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/analytics` | KPIs del hotel: huéspedes, reservas activas, mensajes del día | JWT |

### Notificaciones

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/api/notifications/send` | Enviar email manual a un huésped | JWT |
| GET | `/api/notifications/test` | Enviar email de prueba al usuario logueado | JWT |

### Pagos (Stripe)

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/api/payments/checkout` | Crear sesión Stripe Checkout para un servicio | No |
| POST | `/api/payments/webhook` | Webhook de Stripe (body raw, registrado antes de express.json) | No |
| GET | `/api/payments/orders` | Listar órdenes del hotel | JWT |

### Webhook WhatsApp

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| POST | `/webhook/twilio` o `/api/webhook/twilio` | Entrada de mensajes WhatsApp via Twilio | No |
| GET | `/webhook/status` o `/api/webhook/status` | Estado del webhook y última actividad | No |

### Health

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/health` | Estado del servidor | No |

---

## Autenticación y roles

El middleware `auth.js` verifica el JWT en el header `Authorization: Bearer <token>`.

El payload del token contiene:

```json
{
  "email": "admin@hotel.com",
  "role": "hotel_manager",
  "hotel_id": "h_abc123",
  "name": "Admin Hotel"
}
```

Roles disponibles:
- `super_admin` — acceso total a todos los hoteles
- `hotel_manager` — acceso restringido a su propio `hotel_id`

---

## Arquitectura multi-tenant

Cada request autenticado expone `req.user.hotel_id`. Las consultas a Supabase filtran siempre por `hotel_id`, garantizando aislamiento de datos entre hoteles.

Supabase tiene RLS habilitado en todas las tablas. Las políticas se aplican en la capa de base de datos como segunda línea de defensa. El backend usa la `service_role_key` (que bypasa RLS) y es responsable de aplicar el filtro por `hotel_id` en cada query.

---

## Migraciones

Las migraciones son archivos SQL en `/migrations/`. Para ejecutarlas:

1. Abrí tu proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor**
3. Copiar el contenido de cada archivo en orden (`001_`, `002_`, etc.)
4. Ejecutar

No hay sistema de migraciones automático — aplicación manual en Supabase SQL Editor.

---

## Deploy en Railway

1. Crear nuevo proyecto en [railway.app](https://railway.app)
2. Conectar el repositorio de GitHub
3. Agregar las variables de entorno en **Settings → Variables** (todas las del `.env.example`)
4. Railway detecta automáticamente Node.js y ejecuta `node server.js` (ajustar en `Procfile` si es necesario)
5. Cada push a la rama conectada dispara un redeploy automático

Asegurate de que `PORT` NO esté fija en Railway — Railway inyecta su propio `PORT`. El servidor lee `process.env.PORT || 3000`, así que funciona sin configuración extra.
