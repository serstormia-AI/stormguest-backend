/**
 * emailService.js — StormGuest Email Notifications
 *
 * Variables de entorno requeridas:
 *   EMAIL_HOST   — servidor SMTP, ej: smtp.gmail.com
 *   EMAIL_PORT   — puerto SMTP, ej: 587
 *   EMAIL_USER   — usuario SMTP / dirección de correo
 *   EMAIL_PASS   — contraseña SMTP o App Password
 *   EMAIL_FROM   — dirección visible, ej: "StormGuest <noreply@tuhotel.com>"
 *
 * Si alguna falta, las funciones retornan { sent: false, reason: 'not_configured' }
 * sin lanzar excepción.
 */

const nodemailer = require('nodemailer');

// ── Transporter ───────────────────────────────────────────────────────────────

let globalTransporter = null;

function getGlobalTransporter() {
    if (globalTransporter) return globalTransporter;

    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;

    if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) {
        console.warn(
            '[emailService] WARNING: EMAIL_HOST, EMAIL_PORT, EMAIL_USER o EMAIL_PASS no están configuradas. ' +
            'Los emails no se enviarán. Configura estas variables en Railway (o .env local).'
        );
        return null;
    }

    globalTransporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: Number(EMAIL_PORT),
        secure: Number(EMAIL_PORT) === 465,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
    });

    return globalTransporter;
}

/**
 * Retorna un transporter usando la config del hotel si está disponible,
 * o el transporter global con env vars como fallback.
 * @param {Object|null} hotelConfig — { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
function getTransporter(hotelConfig) {
    if (hotelConfig && hotelConfig.smtp_host && hotelConfig.smtp_user && hotelConfig.smtp_pass) {
        return nodemailer.createTransport({
            host: hotelConfig.smtp_host,
            port: Number(hotelConfig.smtp_port) || 587,
            secure: Number(hotelConfig.smtp_port) === 465,
            auth: {
                user: hotelConfig.smtp_user,
                pass: hotelConfig.smtp_pass,
            },
        });
    }
    return getGlobalTransporter();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FROM = (hotelConfig) => {
    if (hotelConfig && hotelConfig.smtp_from) return hotelConfig.smtp_from;
    return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'StormGuest <noreply@stormguest.com>';
};

/**
 * escapeHtml — sanitiza caracteres especiales para prevenir inyección HTML.
 * Aplicar siempre a contenido ingresado por el usuario antes de insertarlo en templates HTML.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function baseTemplate(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; background: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #18181b; border-radius: 12px; overflow: hidden; }
    .header { background: #10b981; padding: 28px 32px; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p  { margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 32px; color: #e4e4e7; font-size: 15px; line-height: 1.6; }
    .body h2 { color: #fff; font-size: 18px; margin-top: 0; }
    .divider { border: none; border-top: 1px solid #27272a; margin: 24px 0; }
    .badge { display: inline-block; background: #10b981; color: #fff; border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; }
    .footer { padding: 20px 32px; color: #52525b; font-size: 12px; border-top: 1px solid #27272a; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>StormGuest</h1>
      <p>Plataforma de gestión hotelera</p>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      Este mensaje fue generado automáticamente por StormGuest. Por favor no respondas este correo.
    </div>
  </div>
</body>
</html>`;
}

async function sendMail({ to, subject, html }, hotelConfig = null) {
    const t = getTransporter(hotelConfig);
    if (!t) return { sent: false, reason: 'not_configured' };

    try {
        const info = await t.sendMail({ from: FROM(hotelConfig), to, subject, html });
        console.log(`[emailService] Email enviado a ${to} — messageId: ${info.messageId}`);
        return { sent: true, messageId: info.messageId };
    } catch (err) {
        console.error('[emailService] Error al enviar email:', err.message);
        return { sent: false, reason: err.message };
    }
}

// ── Funciones públicas ────────────────────────────────────────────────────────

/**
 * sendWelcomeEmail — se llama al hacer check-in de un huésped.
 * @param {Object} guest        — { name, email }
 * @param {Object} hotelConfig  — opcional: { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
async function sendWelcomeEmail(guest, hotelConfig = null) {
    const html = baseTemplate(
        'Bienvenido a tu estadía',
        `<h2>¡Bienvenido, ${guest.name}!</h2>
        <p>Nos alegra tenerte con nosotros. Tu check-in fue registrado exitosamente.</p>
        <hr class="divider" />
        <p>Durante tu estadía puedes contactar a recepción en cualquier momento. Queremos que tu experiencia sea perfecta.</p>
        <p><span class="badge">Check-in completado</span></p>`
    );

    return sendMail({
        to: guest.email,
        subject: '¡Bienvenido! Tu check-in fue confirmado — StormGuest',
        html,
    }, hotelConfig);
}

/**
 * sendCheckoutEmail — se llama al hacer check-out.
 * @param {Object} guest        — { name, email }
 * @param {Object} reservation  — { check_in, check_out }
 * @param {Object} hotelConfig  — opcional: { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
async function sendCheckoutEmail(guest, reservation, hotelConfig = null) {
    const checkIn  = reservation.check_in  ? new Date(reservation.check_in).toLocaleDateString('es-ES')  : '—';
    const checkOut = reservation.check_out ? new Date(reservation.check_out).toLocaleDateString('es-ES') : '—';

    const html = baseTemplate(
        'Gracias por tu estadía',
        `<h2>¡Hasta pronto, ${guest.name}!</h2>
        <p>Tu check-out fue procesado correctamente. Esperamos que hayas disfrutado tu estadía.</p>
        <hr class="divider" />
        <p><strong>Fechas de tu reserva:</strong></p>
        <p>Check-in: <strong>${checkIn}</strong> &nbsp;→&nbsp; Check-out: <strong>${checkOut}</strong></p>
        <p>Si tienes comentarios sobre tu experiencia, nos encantaría escucharlos.</p>
        <p><span class="badge">Check-out completado</span></p>`
    );

    return sendMail({
        to: guest.email,
        subject: '¡Gracias por quedarte con nosotros! — StormGuest',
        html,
    }, hotelConfig);
}

/**
 * sendOrderConfirmation — se llama al crear un pedido de room service / upsell.
 * @param {Object} order       — { guest_name, guest_email, service_name, amount, id }
 * @param {Object} hotelConfig — opcional: { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
async function sendOrderConfirmation(order, hotelConfig = null) {
    const amount = order.amount != null ? `$${Number(order.amount).toFixed(2)}` : '—';

    const html = baseTemplate(
        'Confirmación de pedido',
        `<h2>Pedido confirmado, ${order.guest_name}!</h2>
        <p>Tu solicitud fue recibida y está siendo procesada.</p>
        <hr class="divider" />
        <p><strong>Servicio:</strong> ${order.service_name}</p>
        <p><strong>Total:</strong> ${amount}</p>
        ${order.id ? `<p style="color:#52525b;font-size:13px;">Referencia: <code>${order.id}</code></p>` : ''}
        <p><span class="badge">En proceso</span></p>`
    );

    return sendMail({
        to: order.guest_email,
        subject: `Pedido confirmado: ${order.service_name} — StormGuest`,
        html,
    }, hotelConfig);
}

/**
 * sendCustomEmail — email manual enviado desde el panel de Notificaciones.
 * @param {Object} params      — { to, name, subject, message }
 * @param {Object} hotelConfig — opcional: { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
async function sendCustomEmail({ to, name, subject, message }, hotelConfig = null) {
    // Security: escape user-provided content to prevent HTML injection
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
    const safeName = name ? escapeHtml(name) : null;

    const html = baseTemplate(
        safeSubject,
        `<h2>${safeSubject}</h2>
        ${safeName ? `<p>Hola <strong>${safeName}</strong>,</p>` : ''}
        <p>${safeMessage}</p>`
    );

    return sendMail({ to, subject, html }, hotelConfig);
}

/**
 * sendTestEmail — email de prueba al usuario del panel.
 * @param {string} to          — email del usuario logueado
 * @param {Object} hotelConfig — opcional: { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from }
 */
async function sendTestEmail(to, hotelConfig = null) {
    const html = baseTemplate(
        'Email de prueba — StormGuest',
        `<h2>¡Las notificaciones funcionan!</h2>
        <p>Este es un email de prueba enviado desde el panel de administración de StormGuest.</p>
        <hr class="divider" />
        <p>Si recibiste este mensaje, la configuración SMTP es correcta.</p>
        <p><span class="badge">Prueba exitosa</span></p>`
    );

    return sendMail({
        to,
        subject: 'Email de prueba — StormGuest',
        html,
    }, hotelConfig);
}

module.exports = {
    sendWelcomeEmail,
    sendCheckoutEmail,
    sendOrderConfirmation,
    sendCustomEmail,
    sendTestEmail,
};
