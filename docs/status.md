# StormGuest — Estado Actual

> Última actualización: Mayo 2026

## Estado por módulo

| Módulo | Completitud | Notas |
|--------|:-----------:|-------|
| App móvil huésped (Next.js) | 70% | UI completa, chat en tiempo real, catálogo, compras. Sin auth propia (acceso por hotel_id en URL) |
| Dashboard admin (React+Vite) | 85% | Inbox, kanban check-ins, solicitudes, reviews, configuración, integraciones, RBAC completo |
| Backend API (Express 5) | 90% | Rutas completas, JWT, CRUD, crons, PMS, pagos, reviews, IA |
| IA / Chatbot (Claude) | 85% | Conectado a Anthropic SDK, responde automáticamente, usa system_prompt por hotel |
| WhatsApp (Twilio) | 80% | Webhook entrante funcional, respuestas salientes, validación de firma |
| Base de datos (Supabase) | 95% | Schema completo, 7 migraciones aplicadas |
| PMS — CSV import | 100% | Aliases ES/EN, upsert por external_uid |
| PMS — iCal sync | 100% | Cron cada hora, upsert idempotente |
| PMS — Webhook receiver | 100% | HMAC-SHA256, normalizers Cloudbeds/Apaleo/generic |
| PMS — API polling | 100% | Cron 15 min, Cloudbeds + Apaleo, logs de sync |
| Pagos (Stripe por hotel) | 100% | Claves cifradas AES-256-GCM, fallback a env global |
| Email (SMTP por hotel) | 100% | Settings migration 004, fallback a env global |
| Reviews | 100% | Métricas, filtros, respuesta inline, API completa |
| RBAC | 100% | 3 roles, RoleRoute en frontend, canAccess() |
| Super Admin | 100% | CRUD hoteles y usuarios, onboarding wizard |
| Tests | 100% | 34/34 pasan (auth, reviews, integrations, settings, webhook, rbac) |
| CI/CD | 100% | GitHub Actions en ambos repos |
| Docker | 100% | node:20-alpine, .dockerignore |

## Migraciones aplicadas en Supabase

| Archivo | Contenido | Estado |
|---------|-----------|--------|
| `001_initial.sql` | Tablas base: hotels, guests, reservations, conversations, messages | ✅ Aplicada |
| `002_services.sql` | services, orders, order_items | ✅ Aplicada |
| `003_reviews.sql` | reviews table | ✅ Aplicada |
| `004_hotel_settings.sql` | smtp_*, system_prompt en hotels | ✅ Aplicada |
| `005_integrations.sql` | hotel_integrations, external_uid en reservations | ✅ Aplicada* |
| `006_sync_logs.sql` | integration_sync_logs, external_source en reservations | ✅ Aplicada* |
| `007_stripe_per_hotel.sql` | stripe_secret_key_enc, stripe_publishable_key, stripe_webhook_secret_enc | ✅ Aplicada |

*Confirmar en Supabase SQL Editor si no se ejecutaron manualmente.

## Pendientes para producción real

### Crítico
- [ ] `ENCRYPTION_KEY` debe estar seteada en Railway (sin esto Stripe por hotel y PMS credentials no funcionan)
- [ ] Row Level Security (RLS) en Supabase — actualmente el aislamiento multi-tenant es solo a nivel de app
- [ ] Auth real en app de huéspedes — actualmente cualquiera puede acceder cambiando hotel_id en URL

### Importante
- [ ] Revisar app de huéspedes (stormguest-app) — no se auditó en esta sesión
- [ ] Multi-idioma — todo hardcodeado en español
- [ ] Subida de imágenes para servicios/experiencias — no hay upload implementado
- [ ] Analytics panel — actualmente devuelve datos mock cuando DB está vacía

### Nice-to-have
- [ ] Documentación de API (Swagger/OpenAPI)
- [ ] Monitoring / alertas de producción
- [ ] Rate limiting por IP o por hotel

## CI/CD

- **Backend**: Tests → Docker build (GitHub Actions)
- **Frontend**: npm build (GitHub Actions)
- **Deploy backend**: Railway (manual o automático desde main)
- **Deploy frontend**: Vercel (automático desde main)
