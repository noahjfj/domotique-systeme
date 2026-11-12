// Source de données simulée : permet de voir le plan "vivre" sans Home Assistant.

const rand = (a, b) => a + Math.random() * (b - a);

export class DemoSource {
  constructor(devices, onPatch, onStatus) {
    this.devices = devices;
    this.onPatch = onPatch;
    this.onStatus = onStatus;
    this.state = {};
    this.t = 0;
    this.providesEnergy = true;
  }

  connect() {
    for (const d of this.devices) {
      this.state[d.id] = {
        on: d.demo?.on ?? false,
        brightness: d.demo?.brightness ?? 255,
        energy: d.type === 'outlet' ? rand(0.05, 1.5) : rand(0.01, 0.1),
        timer: 0,
        phase: Math.random() * 300,
      };
    }
    this.onStatus('demo');
    this.tick(0);
    this.interval = setInterval(() => this.tick(1), 1000);
  }

  disconnect() {
    clearInterval(this.interval);
  }

  powerFor(d, s) {
    const t = this.t + s.phase;
    if (d.type === 'light') return s.on ? d.nominalW * (0.15 + 0.85 * s.brightness / 255) : 0;
    if (!s.on) return 0;
    switch (d.demo?.kind) {
      case 'fridge':  return (t % 300) < 120 ? rand(80, 95) : rand(1, 2);
      case 'tv':      return rand(68, 78);
      case 'pc':      return 90 + 120 * Math.abs(Math.sin(t / 25)) + rand(0, 20);
      case 'standby': return rand(1.5, 3);
      case 'heater':  return (t % 120) < 75 ? rand(490, 505) : 0;
      case 'washer': {
        const c = t % 900;
        if (c < 180) return rand(1950, 2100);    // chauffe de l'eau
        if (c < 700) return rand(120, 220);      // lavage
        if (c < 820) return rand(350, 480);      // essorage
        return rand(1, 2);                       // pause / fin
      }
      case 'cooking': return (t % 40) < 26 ? rand(1700, 1850) : rand(5, 10);
      case 'kettle': {
        if (s.timer > 0) { s.timer--; return rand(1950, 2050); }
        if (Math.random() < 0.01) s.timer = 90;
        return 0;
      }
      default: return 0;
    }
  }

  tick(dt) {
    this.t += dt;
    for (const d of this.devices) {
      const s = this.state[d.id];
      // Petits changements aléatoires pour animer la démo
      if (d.type === 'light' && Math.random() < 0.004) s.on = !s.on;
      if (d.demo?.kind === 'cooking' && Math.random() < 0.006) s.on = !s.on;

      const power = this.powerFor(d, s);
      s.energy += (power * dt) / 3600 / 1000;
      this.onPatch(d.id, { on: s.on, power, energy: s.energy, brightness: s.brightness, available: true });
    }
  }

  toggle(deviceId) {
    const s = this.state[deviceId];
    if (!s) return;
    s.on = !s.on;
    this.tick(0);
  }
}
