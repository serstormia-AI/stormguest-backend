const axios = require('axios');

const TOKEN_URL = 'https://identity.apaleo.com/connect/token';
const BASE_URL  = 'https://api.apaleo.com';

class ApaleoClient {
  constructor({ client_id, client_secret, property_id }) {
    this.client_id     = client_id;
    this.client_secret = client_secret;
    this.property_id   = property_id;
    this._token        = null;
    this._tokenExp     = 0;
  }

  async getToken() {
    if (this._token && Date.now() < this._tokenExp - 30000) return this._token;
    const params = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.client_id,
      client_secret: this.client_secret,
      scope:         'reservations.read',
    });
    const { data } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    this._token    = data.access_token;
    this._tokenExp = Date.now() + data.expires_in * 1000;
    return this._token;
  }

  async getReservations({ from, to, pageNumber = 1 }) {
    const token = await this.getToken();
    const { data } = await axios.get(`${BASE_URL}/rbe/v1/reservations`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        propertyId:    this.property_id,
        dateFilter:    'Arrival',
        from,
        to,
        pageNumber,
        pageSize:      100,
        expand:        'booker,primaryGuest,property,unitGroup,services',
      },
      timeout: 20000,
    });
    return data.reservations || [];
  }

  async getAllReservations({ from, to }) {
    let page = 1;
    let all  = [];
    while (true) {
      const batch = await this.getReservations({ from, to, pageNumber: page });
      all = all.concat(batch);
      if (batch.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }
    return all;
  }
}

function normalizeReservation(r) {
  const g = r.primaryGuest || r.booker || {};
  return {
    external_uid:    r.id,
    external_source: 'apaleo',
    guest_name:      `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Sin nombre',
    guest_email:     g.email || null,
    guest_phone:     g.phone || null,
    room_number:     r.unit?.name || r.unitGroup?.name || null,
    check_in:        r.arrival  || null,
    check_out:       r.departure || null,
    status:          mapStatus(r.status),
    notes:           null,
  };
}

function mapStatus(s) {
  const map = {
    confirmed:  'pending',
    inhouse:    'checked_in',
    checkedout: 'checked_out',
    cancelled:  'cancelled',
    noshow:     'cancelled',
  };
  return map[s?.toLowerCase()] || 'pending';
}

function normalizeWebhook(payload) {
  const r = payload.booking?.reservations?.[0] || payload.reservation || {};
  const g = payload.booking?.primaryGuest || r.primaryGuest || {};
  return {
    event:        payload.type,
    external_uid: r.id || payload.booking?.id,
    guest_name:   `${g.firstName || ''} ${g.lastName || ''}`.trim() || null,
    guest_email:  g.email || null,
    check_in:     r.arrival   || null,
    check_out:    r.departure || null,
    status:       mapStatus(r.status),
  };
}

module.exports = { ApaleoClient, normalizeReservation, normalizeWebhook };
