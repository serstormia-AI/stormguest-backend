import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(subject: string, name: string | null, message: string) {
  const safeSubject = escapeHtml(subject)
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />')
  const safeName = name ? escapeHtml(name) : null
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${safeSubject}</title>
  <style>
    body{margin:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    .w{max-width:560px;margin:40px auto;background:#18181b;border-radius:12px;overflow:hidden}
    .h{background:#10b981;padding:28px 32px}
    .h h1{margin:0;color:#fff;font-size:22px;font-weight:700}
    .h p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px}
    .b{padding:32px;color:#e4e4e7;font-size:15px;line-height:1.6}
    .b h2{color:#fff;font-size:18px;margin-top:0}
    .f{padding:20px 32px;color:#52525b;font-size:12px;border-top:1px solid #27272a}
  </style>
</head>
<body>
  <div class="w">
    <div class="h"><h1>StormGuest</h1><p>Plataforma de gestión hotelera</p></div>
    <div class="b">
      <h2>${safeSubject}</h2>
      ${safeName ? `<p>Hola <strong>${safeName}</strong>,</p>` : ''}
      <p>${safeMessage}</p>
    </div>
    <div class="f">Este mensaje fue generado automáticamente por StormGuest.</div>
  </div>
</body>
</html>`
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { sent: false, reason: (err as { message?: string }).message || 'resend_error' }
  }
  return { sent: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return respond({ sent: false, reason: 'not_configured' })

  const from = Deno.env.get('EMAIL_FROM') ?? 'StormGuest <notificaciones@stormguest.com>'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()

    // ── Test email ────────────────────────────────────────────────────────────
    if (body.test) {
      const to: string = body.to
      if (!to) return respond({ sent: false, reason: 'to_required' })
      const html = buildHtml(
        'Email de prueba — StormGuest',
        null,
        '¡Las notificaciones funcionan!\n\nEste es un email de prueba enviado desde el panel de administración de StormGuest.\nSi recibiste este mensaje, la configuración es correcta.'
      )
      return respond(await sendViaResend(resendKey, from, to, 'Email de prueba — StormGuest', html))
    }

    // ── Custom email to guest ─────────────────────────────────────────────────
    const { guest_id, subject, message, hotel_id } = body
    if (!guest_id || !subject || !message || !hotel_id) {
      return respond({ sent: false, reason: 'missing_fields' }, 400)
    }

    // Resolve hotel_id (slug or UUID) → hotel UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hotel_id)
    let hotel: { id: string } | null = null
    if (isUuid) {
      const { data } = await supabase.from('hotels').select('id').eq('id', hotel_id).single()
      hotel = data
    }
    if (!hotel) {
      const { data } = await supabase.from('hotels').select('id').eq('slug', hotel_id).single()
      hotel = data
    }
    if (!hotel) return respond({ sent: false, reason: 'hotel_not_found' }, 404)

    // Get guest
    const { data: guest } = await supabase
      .from('guests')
      .select('name, email')
      .eq('id', guest_id)
      .eq('hotel_id', hotel.id)
      .single()

    if (!guest) return respond({ sent: false, reason: 'guest_not_found' }, 404)
    if (!guest.email) return respond({ sent: false, reason: 'guest_has_no_email' })

    const html = buildHtml(subject, guest.name as string, message)
    return respond(await sendViaResend(resendKey, from, guest.email as string, subject, html))

  } catch (err) {
    return respond({ sent: false, reason: (err as Error).message })
  }
})
