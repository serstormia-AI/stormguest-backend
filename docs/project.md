# StormGuest — Descripción del Proyecto

## ¿Qué es StormGuest?

StormGuest es una plataforma SaaS multi-tenant de experiencia hotelera con IA. Permite a los hoteles automatizar la comunicación con huéspedes, gestionar check-ins, pedidos de servicio, pagos y valoraciones desde un único sistema.

## Repositorios

| Repo | Descripción | Deploy |
|------|-------------|--------|
| `stormguest-backend` | API REST + IA + crons | Railway |
| `stormguest-frontend` | Dashboard admin del hotel | Vercel |
| `stormguest-app` | App móvil para huéspedes | Vercel |

## Stack tecnológico

### Backend (`stormguest-backend`)
- **Runtime**: Node.js 20 / Express 5
- **Base de datos**: PostgreSQL vía Supabase (cliente `@supabase/supabase-js`)
- **Autenticación**: JWT (`jsonwebtoken`) — el token lleva `hotel_id` + `role`
- **IA**: Anthropic Claude (`@anthropic-ai/sdk`) — respuestas automáticas al huésped
- **WhatsApp**: Twilio (webhook entrante + respuestas salientes)
- **Pagos**: Stripe por hotel (claves cifradas con AES-256-GCM)
- **Email**: Nodemailer — configuración global o por hotel
- **Crons**: `node-cron` — iCal sync (cada hora), API polling (cada 15 min), purge de logs (mensual)
- **Cifrado**: `crypto` nativo — AES-256-GCM para credenciales sensibles por hotel
- **PMS**: CSV import, iCal, webhooks, API polling (Cloudbeds, Apaleo)

### Dashboard Admin (`stormguest-frontend`)
- **Framework**: React 18 + Vite
- **Routing**: React Router v6
- **HTTP**: Axios
- **Realtime**: Supabase Realtime (chat inbox)
- **Estilos**: TailwindCSS + Lucide Icons

### App de Huéspedes (`stormguest-app`)
- **Framework**: Next.js 16 / React 19
- **Estilos**: TailwindCSS 4 + Framer Motion
- **Realtime**: Supabase Realtime (chat)

## Funcionalidades implementadas

| Módulo | Estado |
|--------|--------|
| Autenticación JWT + RBAC | ✅ Completo |
| Gestión de reservas | ✅ Completo |
| Chat en tiempo real (huésped ↔ hotel) | ✅ Completo |
| WhatsApp via Twilio | ✅ Completo |
| IA con Claude (respuestas automáticas) | ✅ Completo |
| Catálogo de experiencias/servicios | ✅ Completo |
| Pedidos y órdenes | ✅ Completo |
| Pagos con Stripe (por hotel) | ✅ Completo |
| Valoraciones/reviews | ✅ Completo |
| Email por hotel (SMTP propio) | ✅ Completo |
| PMS — CSV import | ✅ Completo |
| PMS — iCal sync | ✅ Completo |
| PMS — Webhook receiver | ✅ Completo |
| PMS — API polling (Cloudbeds/Apaleo) | ✅ Completo |
| Panel Super Admin (gestión de hoteles) | ✅ Completo |
| Onboarding wizard (nuevo hotel + PMS) | ✅ Completo |
| RBAC (reception / hotel_manager / super_admin) | ✅ Completo |
| Tests (Jest + supertest) | ✅ 34 tests |
| CI/CD (GitHub Actions) | ✅ Backend + Frontend |
| Docker | ✅ node:20-alpine |

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| `reception` | Check-ins, Chat, Solicitudes, Órdenes |
| `hotel_manager` | Todo lo anterior + Catálogo, Reviews, Notificaciones, Configuración, Integraciones |
| `super_admin` | Todo + Panel de administración global |

## Variables de entorno requeridas

Ver [`.env.example`](../.env.example) para la lista completa con instrucciones de generación.

Variables críticas para producción:
- `JWT_SECRET` — firma de tokens
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — base de datos
- `ENCRYPTION_KEY` — cifrado AES-256-GCM (generar con `openssl rand -hex 32`)
- `ANTHROPIC_API_KEY` — IA
- `TWILIO_*` — WhatsApp
