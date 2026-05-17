const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const Papa = require('papaparse');
const { supabase } = require('../services/supabaseClient');
const auth = require('../middleware/auth');
const { runAllIcalSyncs, syncIcalIntegration } = require('../services/icalSync');
const { pollIntegration } = require('../services/apiPolling');
const { encryptField } = require('../services/crypto');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Aliases de columnas CSV (case-insensitive)
const COLUMN_ALIASES = {
  name:        ['nombre', 'nombre_huesped', 'guest_name', 'huesped', 'name'],
  email:       ['correo', 'email', 'mail'],
  phone:       ['telefono', 'celular', 'phone', 'tel'],
  room_number: ['habitacion', 'room', 'cuarto', 'nro_hab', 'room_number', 'habitación'],
  check_in:    ['entrada', 'checkin', 'check_in', 'arrival', 'fecha_entrada'],
  check_out:   ['salida', 'checkout', 'check_out', 'departure', 'fecha_salida'],
  notes:       ['notas', 'comments', 'observaciones', 'notes'],
};

function buildColumnMap(headers) {
  const map = {};
  for (const header of headers) {
    const key = header.toLowerCase().trim().replace(/\s+/g, '_');
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key)) { map[header] = field; break; }
    }
  }
  return map;
}

function normalizeRow(row, columnMap) {
  const out = {};
  for (const [header, field] of Object.entries(columnMap)) {
    const val = row[header]?.toString().trim();
    if (val) out[field] = val;
  }
  return out;
}

function parseDate(str) {
  if (!str) return null;
  // Try DD/MM/YYYY and YYYY-MM-DD
  const parts = str.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!parts) return null;
  let [, a, b, c] = parts;
  const d = a.length === 4 ? new Date(`${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`)
                           : new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
  return isNaN(d) ? null : d.toISOString();
}

// ── GET /api/integrations — listar integraciones del hotel ────
router.get('/', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { data, error } = await supabase
    .from('hotel_integrations')
    .select('id, type, provider, active, last_sync, last_error, created_at, config')
    .eq('hotel_id', hotel_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Ocultar secrets del config
  const safe = (data || []).map(i => ({
    ...i,
    config: { ...i.config, webhook_secret: i.config.webhook_secret ? '••••••' : undefined },
  }));
  res.json(safe);
});

// ── POST /api/integrations/import/csv ─────────────────────────
router.post('/import/csv', auth(), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo CSV' });

  const hotel_id = req.user.hotel_id;
  const csvText = req.file.buffer.toString('utf8');

  const { data: rows, errors: parseErrors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8',
  });

  if (!rows.length) return res.status(400).json({ error: 'El archivo está vacío o no tiene filas válidas' });

  const columnMap = buildColumnMap(Object.keys(rows[0]));
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 2;
    try {
      const norm = normalizeRow(row, columnMap);
      const check_in  = parseDate(norm.check_in);
      const check_out = parseDate(norm.check_out);

      if (!check_in || !check_out) {
        results.errors.push({ row: rowNum, reason: 'check_in y check_out son obligatorios y deben ser fechas válidas' });
        results.skipped++;
        continue;
      }

      // Upsert guest if email or phone given
      let guest_id = null;
      if (norm.email || norm.phone) {
        const lookup = norm.email
          ? supabase.from('guests').select('id').eq('hotel_id', hotel_id).eq('email', norm.email).maybeSingle()
          : supabase.from('guests').select('id').eq('hotel_id', hotel_id).eq('phone', norm.phone).maybeSingle();

        const { data: existingGuest } = await lookup;
        if (existingGuest) {
          guest_id = existingGuest.id;
        } else if (norm.name) {
          const { data: newGuest } = await supabase.from('guests').insert({
            hotel_id,
            name:  norm.name,
            email: norm.email || null,
            phone: norm.phone || null,
          }).select('id').single();
          if (newGuest) guest_id = newGuest.id;
        }
      }

      // Check existing reservation by guest + check_in
      const { data: existing } = guest_id
        ? await supabase.from('reservations').select('id')
            .eq('hotel_id', hotel_id).eq('guest_id', guest_id).eq('check_in', check_in).maybeSingle()
        : { data: null };

      const payload = {
        hotel_id,
        guest_id,
        check_in,
        check_out,
        room_number: norm.room_number || null,
        notes:       norm.notes || null,
        status:      'pending',
      };

      if (existing) {
        await supabase.from('reservations').update(payload).eq('id', existing.id);
        results.updated++;
      } else {
        await supabase.from('reservations').insert(payload);
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: rowNum, reason: err.message });
      results.skipped++;
    }
  }

  res.json(results);
});

// ── POST /api/integrations/ical — agregar/actualizar URL iCal ─
router.post('/ical', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { ical_url, provider } = req.body;

  if (!ical_url) return res.status(400).json({ error: 'ical_url requerida' });

  // Check if already exists
  const { data: existing } = await supabase
    .from('hotel_integrations')
    .select('id')
    .eq('hotel_id', hotel_id)
    .eq('type', 'ical')
    .maybeSingle();

  if (existing) {
    await supabase.from('hotel_integrations')
      .update({ config: { ical_url }, provider: provider || null, active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('hotel_integrations')
      .insert({ hotel_id, type: 'ical', provider: provider || null, config: { ical_url }, active: true });
  }

  res.json({ ok: true, message: 'Integración iCal guardada' });
});

// ── POST /api/integrations/ical/sync — sincronización manual ─
router.post('/ical/sync', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { data: integration } = await supabase
    .from('hotel_integrations')
    .select('*')
    .eq('hotel_id', hotel_id)
    .eq('type', 'ical')
    .eq('active', true)
    .maybeSingle();

  if (!integration) return res.status(404).json({ error: 'No hay integración iCal configurada' });

  try {
    await syncIcalIntegration(integration);
    res.json({ ok: true, message: 'Sincronización completada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/integrations/webhook/:hotel_slug — push desde PMS
router.post('/webhook/:hotel_slug',
  express.raw({ type: ['application/json', 'application/x-www-form-urlencoded'] }),
  async (req, res) => {
    res.sendStatus(200); // respuesta inmediata

    const { hotel_slug } = req.params;

    const { data: hotel } = await supabase
      .from('hotels').select('id').eq('slug', hotel_slug).maybeSingle();
    if (!hotel) return;

    const { data: integration } = await supabase
      .from('hotel_integrations')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('type', 'webhook')
      .eq('active', true)
      .maybeSingle();
    if (!integration) return;

    const secret = integration.config?.webhook_secret;
    const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'];

    if (secret && signature) {
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.body).digest('hex');
      try {
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
          console.warn(`[webhook-pms] HMAC inválido para ${hotel_slug}`);
          return;
        }
      } catch { return; }
    }

    let payload;
    try { payload = JSON.parse(req.body.toString()); } catch { return; }

    const provider = integration.provider;
    const normalized = normalizeWebhookPayload(provider, payload);
    if (normalized) await processWebhookEvent(hotel.id, normalized);
  }
);

// ── POST /api/integrations/webhook-config — guardar config ───
router.post('/webhook-config', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { provider, webhook_secret } = req.body;

  const secret = webhook_secret || crypto.randomBytes(24).toString('hex');

  const { data: existing } = await supabase
    .from('hotel_integrations').select('id')
    .eq('hotel_id', hotel_id).eq('type', 'webhook').maybeSingle();

  if (existing) {
    await supabase.from('hotel_integrations')
      .update({ provider, config: { webhook_secret: secret }, active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('hotel_integrations')
      .insert({ hotel_id, type: 'webhook', provider, config: { webhook_secret: secret }, active: true });
  }

  res.json({ ok: true, webhook_secret: secret });
});

// ── POST /api/integrations/polling — configurar API polling ──
router.post('/polling', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { provider, api_key, client_id, client_secret, property_id } = req.body;

  if (!provider) return res.status(400).json({ error: 'provider requerido' });

  // Encriptar credenciales sensibles
  const config = { property_id: property_id || null };
  if (api_key)     config.api_key_enc     = encryptField(api_key);
  if (client_id)   config.client_id_enc   = encryptField(client_id);
  if (client_secret) config.client_secret_enc = encryptField(client_secret);

  const { data: existing } = await supabase
    .from('hotel_integrations').select('id')
    .eq('hotel_id', hotel_id).eq('type', 'api_polling').eq('provider', provider).maybeSingle();

  if (existing) {
    await supabase.from('hotel_integrations')
      .update({ config, active: true, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('hotel_integrations')
      .insert({ hotel_id, type: 'api_polling', provider, config, active: true });
  }

  res.json({ ok: true, message: `Polling ${provider} configurado` });
});

// ── POST /api/integrations/:id/poll — polling manual ─────────
router.post('/:id/poll', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { data: integration } = await supabase
    .from('hotel_integrations').select('*')
    .eq('id', req.params.id).eq('hotel_id', hotel_id).maybeSingle();

  if (!integration) return res.status(404).json({ error: 'Integración no encontrada' });
  if (integration.type !== 'api_polling') return res.status(400).json({ error: 'Solo para integraciones de tipo api_polling' });

  try {
    await pollIntegration(integration);
    res.json({ ok: true, message: 'Polling completado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/integrations/:id/logs — historial de sync ───────
router.get('/:id/logs', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  const { data, error } = await supabase
    .from('integration_sync_logs')
    .select('*')
    .eq('integration_id', req.params.id)
    .eq('hotel_id', hotel_id)
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/integrations/health — estado de todas las integraciones ─
router.get('/health', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { data: integrations } = await supabase
    .from('hotel_integrations')
    .select('id, type, provider, active, last_sync, last_error')
    .eq('hotel_id', hotel_id);

  const health = (integrations || []).map(i => {
    let status = 'ok';
    if (!i.active)       status = 'inactive';
    else if (i.last_error) status = 'error';
    else if (i.type === 'ical' && i.last_sync) {
      const hoursSince = (Date.now() - new Date(i.last_sync)) / 36e5;
      if (hoursSince > 2) status = 'stale';
    } else if (i.type === 'api_polling' && i.last_sync) {
      const minsSince = (Date.now() - new Date(i.last_sync)) / 60000;
      if (minsSince > 30) status = 'stale';
    }
    return { ...i, status };
  });

  res.json(health);
});

// ── DELETE /api/integrations/:id ──────────────────────────────
router.delete('/:id', auth(), async (req, res) => {
  const hotel_id = req.user.hotel_id;
  const { error } = await supabase.from('hotel_integrations')
    .delete().eq('id', req.params.id).eq('hotel_id', hotel_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────
function normalizeWebhookPayload(provider, payload) {
  if (provider === 'cloudbeds') {
    const r = payload.reservation;
    if (!r) return null;
    return {
      event:        payload.action,
      external_id:  r.id?.toString(),
      guest_name:   r.guestName,
      guest_email:  r.guestEmail,
      guest_phone:  r.guestPhone,
      room_number:  r.roomNumber,
      check_in:     r.startDate,
      check_out:    r.endDate,
    };
  }
  if (provider === 'apaleo') {
    const r = payload.reservation;
    if (!r) return null;
    return {
      event:       payload.type,
      external_id: r.id,
      guest_name:  `${r.primaryGuest?.firstName || ''} ${r.primaryGuest?.lastName || ''}`.trim(),
      guest_email: r.primaryGuest?.email,
      check_in:    r.arrival,
      check_out:   r.departure,
    };
  }
  // Generic fallback
  return {
    event:       payload.event || payload.type || payload.action,
    external_id: payload.id?.toString(),
    guest_name:  payload.guest_name || payload.guestName,
    guest_email: payload.guest_email || payload.guestEmail,
    check_in:    payload.check_in || payload.arrival,
    check_out:   payload.check_out || payload.departure,
  };
}

async function processWebhookEvent(hotel_id, norm) {
  const { event, external_id, guest_name, guest_email, guest_phone, room_number, check_in, check_out } = norm;

  if (!external_id) return;

  // cancelled → marcar como cancelled
  if (event?.includes('cancel')) {
    await supabase.from('reservations')
      .update({ status: 'cancelled' })
      .eq('hotel_id', hotel_id).eq('external_uid', external_id);
    return;
  }

  // checkin → marcar checked_in
  if (event?.includes('checkin') || event?.includes('check_in')) {
    await supabase.from('reservations')
      .update({ status: 'checked_in' })
      .eq('hotel_id', hotel_id).eq('external_uid', external_id);
    return;
  }

  // created / updated → upsert
  let guest_id = null;
  if (guest_email || guest_phone) {
    const lookup = guest_email
      ? supabase.from('guests').select('id').eq('hotel_id', hotel_id).eq('email', guest_email).maybeSingle()
      : supabase.from('guests').select('id').eq('hotel_id', hotel_id).eq('phone', guest_phone).maybeSingle();
    const { data: g } = await lookup;
    if (g) {
      guest_id = g.id;
    } else if (guest_name) {
      const { data: newG } = await supabase.from('guests')
        .insert({ hotel_id, name: guest_name, email: guest_email || null, phone: guest_phone || null })
        .select('id').single();
      if (newG) guest_id = newG.id;
    }
  }

  const { data: existing } = await supabase.from('reservations')
    .select('id').eq('hotel_id', hotel_id).eq('external_uid', external_id).maybeSingle();

  const payload = {
    hotel_id,
    guest_id,
    external_uid: external_id,
    room_number:  room_number || null,
    check_in:     check_in   || null,
    check_out:    check_out  || null,
    status:       'pending',
  };

  if (existing) {
    await supabase.from('reservations').update(payload).eq('id', existing.id);
  } else {
    await supabase.from('reservations').insert(payload);
  }
}

module.exports = router;
