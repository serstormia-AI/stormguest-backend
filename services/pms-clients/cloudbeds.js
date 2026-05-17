const axios = require('axios');

const BASE_URL = 'https://hotels.cloudbeds.com/api/v1.1';

class CloudbedsClient {
  constructor({ api_key, property_id }) {
    this.api_key     = api_key;
    this.property_id = property_id;
  }

  get headers() {
    return { Authorization: `Bearer ${this.api_key}` };
  }

  async getReservations({ from, to, status = 'all', page = 1 }) {
    const { data } = await axios.get(`${BASE_URL}/getReservations`, {
      headers: this.headers,
      params: {
        propertyID:       this.property_id,
        dateType:         'arrival',
        startDate:        from,
        endDate:          to,
        status,
        includeGuestInfo: true,
        pageNumber:       page,
        pageSize:         100,
      },
      timeout: 20000,
    });
    if (!data.success) throw new Error(data.message || 'Cloudbeds API error');
    return data.data || [];
  }

  async getAllReservations({ from, to }) {
    let page = 1;
    let all  = [];
    while (true) {
      const batch = await this.getReservations({ from, to, page });
      all = all.concat(batch);
      if (batch.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 300)); // rate limiting
    }
    return all;
  }
}

// Normalize a Cloudbeds reservation to StormGuest format
function normalizeReservation(r) {
  const guest = r.guestList?.[0] || {};
  return {
    external_uid:  r.reservationID?.toString(),
    external_source: 'cloudbeds',
    guest_name:    `${guest.guestFirstName || ''} ${guest.guestLastName || ''}`.trim() || 'Sin nombre',
    guest_email:   guest.guestEmail   || null,
    guest_phone:   guest.guestPhone   || null,
    room_number:   r.roomList?.[0]?.roomNumber?.toString() || null,
    check_in:      r.startDate ? new Date(r.startDate).toISOString() : null,
    check_out:     r.endDate   ? new Date(r.endDate).toISOString()   : null,
    status:        mapStatus(r.status),
    notes:         r.notes || null,
  };
}

function mapStatus(s) {
  const map = {
    confirmed:   'pending',
    checked_in:  'checked_in',
    checked_out: 'checked_out',
    cancelled:   'cancelled',
    no_show:     'cancelled',
  };
  return map[s?.toLowerCase()] || 'pending';
}

// Normalize a Cloudbeds webhook payload
function normalizeWebhook(payload) {
  const r = payload.reservation || payload;
  return {
    event:       payload.action,
    external_uid: r.reservationID?.toString() || r.id?.toString(),
    guest_name:  r.guestName  || null,
    guest_email: r.guestEmail || null,
    guest_phone: r.guestPhone || null,
    room_number: r.roomNumber?.toString() || null,
    check_in:    r.startDate  ? new Date(r.startDate).toISOString() : null,
    check_out:   r.endDate    ? new Date(r.endDate).toISOString()   : null,
    status:      mapStatus(r.status),
  };
}

module.exports = { CloudbedsClient, normalizeReservation, normalizeWebhook };
