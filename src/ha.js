// Client minimal pour l'API WebSocket de Home Assistant.
// Doc : https://developers.home-assistant.io/docs/api/websocket

export function toWebSocketUrl(haUrl) {
  let url = (haUrl || '').trim().replace(/\/+$/, '');
  if (!url) url = window.location.origin; // page servie depuis HA (/local/...)
  url = url.replace(/^http/, 'ws');
  if (!/\/api\/websocket$/.test(url)) url += '/api/websocket';
  return url;
}

export class HAClient {
  /**
   * @param {object} opts
   * @param {string} opts.url       URL Home Assistant (http(s)://...)
   * @param {string} opts.token     jeton longue durée
   * @param {Map<string, Array<{deviceId:string, field:string}>>} opts.entityMap
   * @param {(deviceId:string, patch:object) => void} opts.onPatch
   * @param {(status:string, detail?:string) => void} opts.onStatus
   */
  constructor({ url, token, entityMap, onPatch, onStatus }) {
    this.url = toWebSocketUrl(url);
    this.token = token;
    this.entityMap = entityMap;
    this.onPatch = onPatch;
    this.onStatus = onStatus;
    this.msgId = 1;
    this.pending = new Map();
    this.retry = 0;
    this.closed = false;
    this.providesEnergy = false;
  }

  connect() {
    this.onStatus('connecting');
    const ws = (this.ws = new WebSocket(this.url));

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case 'auth_required':
          ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
          break;
        case 'auth_ok':
          this.retry = 0;
          this.onStatus('connected', msg.ha_version);
          this.send({ type: 'get_states' }).then((states) => {
            for (const s of states) this.applyState(s.entity_id, s);
          });
          this.send({ type: 'subscribe_events', event_type: 'state_changed' });
          break;
        case 'auth_invalid':
          this.closed = true;
          this.onStatus('error', 'Jeton invalide');
          ws.close();
          break;
        case 'result': {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            msg.success ? p.resolve(msg.result) : p.reject(msg.error);
          }
          break;
        }
        case 'event': {
          const d = msg.event?.data;
          if (d?.entity_id && d.new_state) this.applyState(d.entity_id, d.new_state);
          break;
        }
      }
    };

    ws.onerror = () => this.onStatus('error', 'Connexion impossible');
    ws.onclose = () => {
      if (this.closed) return;
      const delay = Math.min(30000, 1000 * 2 ** this.retry++);
      this.onStatus('error', `Reconnexion dans ${Math.round(delay / 1000)} s`);
      setTimeout(() => this.connect(), delay);
    };
  }

  disconnect() {
    this.closed = true;
    this.ws?.close();
  }

  send(payload) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  applyState(entityId, s) {
    const targets = this.entityMap.get(entityId);
    if (!targets) return;
    for (const { deviceId, field } of targets) {
      const patch = {};
      const num = parseFloat(s.state);
      if (field === 'power') patch.power = Number.isFinite(num) ? num : 0;
      else if (field === 'energy') {
        if (Number.isFinite(num)) {
          // Normalise Wh → kWh si besoin
          const unit = s.attributes?.unit_of_measurement;
          patch.energy = unit === 'Wh' ? num / 1000 : num;
        }
      } else if (field === 'on') {
        patch.on = s.state === 'on';
        patch.available = s.state !== 'unavailable';
        if (s.attributes?.brightness != null) patch.brightness = s.attributes.brightness;
        if (Array.isArray(s.attributes?.rgb_color)) patch.rgb = s.attributes.rgb_color;
      }
      this.onPatch(deviceId, patch);
    }
  }

  toggle(entityId) {
    const domain = entityId.split('.')[0];
    return this.send({
      type: 'call_service',
      domain,
      service: 'toggle',
      target: { entity_id: entityId },
    });
  }
}
