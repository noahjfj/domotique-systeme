import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SETTINGS, PLAN, DEVICES } from './config.js';
import { HAClient } from './ha.js';
import { DemoSource } from './demo.js';

// -----------------------------------------------------------------------------
//  Outils
// -----------------------------------------------------------------------------
const CX = PLAN.width / 2;
const CZ = PLAN.depth / 2;
const P = (x, y, z) => new THREE.Vector3(x - CX, y, z - CZ);
const fmtW = (w) => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w < 10 ? w.toFixed(1) : Math.round(w)} W`);
const fmtKwh = (k) => `${k < 10 ? k.toFixed(2) : k.toFixed(1)} kWh`;
const roomName = (id) => PLAN.rooms.find((r) => r.id === id)?.name ?? id;

// Couleur selon la puissance : vert (faible) → jaune → rouge (> 2 kW), échelle log
function powerColor(w) {
  const t = Math.min(1, Math.log10(w + 1) / Math.log10(2001));
  return new THREE.Color().setHSL(0.36 * (1 - t), 0.85, 0.52);
}

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, v); } catch { /* ignore */ } },
};

// -----------------------------------------------------------------------------
//  Scène
// -----------------------------------------------------------------------------
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f141b');
scene.fog = new THREE.Fog('#0f141b', 18, 40);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0.5, 9.5, 6.5);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.45;
controls.minDistance = 3;
controls.maxDistance = 20;
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight('#cfd8ff', '#2a2118', 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1.2);
sun.position.set(-4, 9, -5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(sun);

// Sol extérieur
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: '#151b23', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// Pièces (sols + étiquettes)
for (const r of PLAN.rooms) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(r.w, r.d),
    new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(P(r.x + r.w / 2, 0, r.z + r.d / 2));
  floor.receiveShadow = true;
  scene.add(floor);

  const el = document.createElement('div');
  el.className = 'room-label';
  el.textContent = r.name;
  const label = new CSS2DObject(el);
  label.position.copy(P(r.x + r.w / 2, 0.02, r.z + r.d / 2));
  scene.add(label);
}

// Murs (+ fenêtres) — reconstruits selon le mode coupe / pleine hauteur
const wallMat = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.9 });
const wallTopMat = new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 1 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: '#9fd3ff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0, depthWrite: false,
});
const wallGroup = new THREE.Group();
scene.add(wallGroup);

function addBox(x1, z1, x2, z2, y0, y1, mats, thick = PLAN.wallThickness, extend = true) {
  if (y1 - y0 <= 0.001) return;
  const len = Math.hypot(x2 - x1, z2 - z1) + (extend ? thick : 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, thick), mats);
  m.position.copy(P((x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2));
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  m.castShadow = m.receiveShadow = true;
  wallGroup.add(m);
}

function buildWalls(cut) {
  wallGroup.clear();
  const H = cut ? PLAN.cutHeight : PLAN.wallHeight;
  const mats = [wallMat, wallMat, wallTopMat, wallMat, wallMat, wallMat]; // dessus foncé = lecture "plan"
  for (const [x1, z1, x2, z2, h] of PLAN.walls) addBox(x1, z1, x2, z2, 0, Math.min(h ?? PLAN.wallHeight, H), mats);
  for (const w of PLAN.windows) {
    addBox(w.x1, w.z1, w.x2, w.z2, 0, Math.min(w.sill, H), mats);
    addBox(w.x1, w.z1, w.x2, w.z2, w.top, H, mats);
    addBox(w.x1, w.z1, w.x2, w.z2, w.sill, Math.min(w.top, H), glassMat, 0.02, false);
  }
}

// Meubles
for (const f of PLAN.furniture) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(f.w, f.h, f.d),
    new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.7 })
  );
  m.position.copy(P(f.x + f.w / 2, (f.y ?? 0) + f.h / 2, f.z + f.d / 2));
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}

// -----------------------------------------------------------------------------
//  Appareils (prises + lampes)
// -----------------------------------------------------------------------------
const pickables = [];
const devices = new Map(); // id → { cfg, state, visuals... }

function makeLabel(cls) {
  const el = document.createElement('div');
  el.className = `dev-label ${cls}`;
  el.innerHTML = '<span class="ic"></span><span class="nm"></span><b class="pw"></b>';
  return el;
}

const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 20);
barGeo.translate(0, 0.5, 0);

for (const cfg of DEVICES) {
  const d = { cfg, state: { on: false, power: 0, energy: 0, brightness: 255, available: true }, energyFromSource: false };
  devices.set(cfg.id, d);

  if (cfg.type === 'outlet') {
    const [x, y, z] = cfg.pos;
    const [nx, nz] = cfg.normal;
    // Plaque de prise sur le mur
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#000000' })
    );
    plate.position.copy(P(x + nx * 0.02, y, z + nz * 0.02));
    plate.rotation.y = Math.atan2(nx, nz);
    plate.userData.deviceId = cfg.id;
    scene.add(plate);
    pickables.push(plate);

    // Colonne de consommation devant la prise
    const bar = new THREE.Mesh(
      barGeo,
      new THREE.MeshStandardMaterial({ color: '#3ad29f', emissive: '#3ad29f', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })
    );
    bar.position.copy(P(x + nx * 0.18, 0, z + nz * 0.18));
    bar.userData.deviceId = cfg.id;
    scene.add(bar);
    pickables.push(bar);

    const el = makeLabel('outlet');
    el.querySelector('.ic').textContent = cfg.icon ?? '🔌';
    el.querySelector('.nm').textContent = cfg.name;
    el.addEventListener('click', () => onDeviceClick(cfg.id));
    const label = new CSS2DObject(el);
    bar.add(label);
    Object.assign(d, { plate, bar, label, el });
  }

  if (cfg.type === 'light') {
    const color = new THREE.Color(cfg.color ?? '#ffe2b0');
    const bulbs = [];
    for (const [x, z] of cfg.points) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 20, 14),
        new THREE.MeshStandardMaterial({ color: '#555', emissive: color, emissiveIntensity: 0 })
      );
      bulb.position.copy(P(x, PLAN.wallHeight - 0.15, z));
      bulb.userData.deviceId = cfg.id;
      const pl = new THREE.PointLight(color, 0, 4, 2);
      pl.position.y = -0.1;
      bulb.add(pl);
      // halo au sol
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.copy(P(x, 0.01, z));
      scene.add(bulb, halo);
      pickables.push(bulb);
      bulbs.push({ bulb, pl, halo });
    }
    const el = makeLabel('light');
    el.querySelector('.ic').textContent = '💡';
    el.querySelector('.nm').textContent = cfg.name;
    el.addEventListener('click', () => onDeviceClick(cfg.id));
    const label = new CSS2DObject(el);
    // étiquette au centre du groupe
    const c = cfg.points.reduce((a, [x, z]) => [a[0] + x / cfg.points.length, a[1] + z / cfg.points.length], [0, 0]);
    label.position.copy(P(c[0], PLAN.wallHeight + 0.15, c[1]));
    scene.add(label);
    Object.assign(d, { bulbs, label, el, baseColor: color });
  }
}

// Met à jour le rendu 3D d'un appareil
function renderDevice(d) {
  const { cfg, state } = d;
  const w = state.power ?? 0;
  if (cfg.type === 'outlet') {
    const col = powerColor(w);
    d.bar.scale.y = 0.03 + Math.min(1.8, Math.log10(w + 1) * 0.55);
    d.bar.material.color.copy(col);
    d.bar.material.emissive.copy(col);
    d.bar.material.opacity = state.on ? 0.85 : 0.25;
    // étiquette juste au-dessus de la colonne (coordonnées locales, compense l'échelle Y)
    d.label.position.set(0, 1 + 0.25 / d.bar.scale.y, 0);
    d.el.querySelector('.pw').textContent = fmtW(w);
    d.el.style.setProperty('--c', `#${col.getHexString()}`);
    d.el.classList.toggle('off', !state.on);
  } else {
    const k = state.on ? 0.25 + 0.75 * (state.brightness ?? 255) / 255 : 0;
    const color = state.rgb ? new THREE.Color(`rgb(${state.rgb.join(',')})`) : d.baseColor;
    for (const b of d.bulbs) {
      b.bulb.material.emissive.copy(color);
      b.bulb.material.emissiveIntensity = k * 3;
      b.bulb.material.color.set(state.on ? '#fff' : '#555');
      b.pl.color.copy(color);
      b.pl.intensity = k * 1.6;
      b.halo.material.color.copy(color);
      b.halo.material.opacity = k * 0.16;
    }
    d.el.querySelector('.pw').textContent = state.on ? fmtW(w) : 'off';
    d.el.style.setProperty('--c', state.on ? `#${color.getHexString()}` : '#5b6472');
    d.el.classList.toggle('off', !state.on);
  }
  d.el.classList.toggle('unavailable', state.available === false);
}

// -----------------------------------------------------------------------------
//  Source de données (démo ou Home Assistant)
// -----------------------------------------------------------------------------
let source = null;

function onPatch(id, patch) {
  const d = devices.get(id);
  if (!d) return;
  if ('energy' in patch) d.energyFromSource = true;
  Object.assign(d.state, patch);
  // Lampe sans capteur de puissance : estimation à partir de la puissance nominale
  if (d.cfg.type === 'light' && !(source instanceof DemoSource) && !d.cfg.power) {
    d.state.power = d.state.on ? d.cfg.nominalW * (0.15 + 0.85 * (d.state.brightness ?? 255) / 255) : 0;
  }
  renderDevice(d);
  dirty = true;
}

function buildEntityMap() {
  const map = new Map();
  const add = (entity, deviceId, field) => {
    if (!entity) return;
    if (!map.has(entity)) map.set(entity, []);
    map.get(entity).push({ deviceId, field });
  };
  for (const c of DEVICES) {
    add(c.power, c.id, 'power');
    add(c.energy, c.id, 'energy');
    add(c.type === 'outlet' ? c.switch : c.entity, c.id, 'on');
  }
  return map;
}

const statusEl = document.getElementById('status');
function onStatus(s, detail = '') {
  const txt = { demo: 'Mode démo', connecting: 'Connexion…', connected: 'Home Assistant', error: 'Erreur' }[s];
  statusEl.className = `status ${s}`;
  statusEl.textContent = detail && s !== 'connected' ? `${txt} · ${detail}` : txt;
  statusEl.title = s === 'connected' ? `Home Assistant ${detail}` : detail;
}

function startSource(cfg) {
  source?.disconnect();
  for (const d of devices.values()) {
    d.energyFromSource = false;
    d.state.energy = 0;
  }
  if (cfg.haUrl && cfg.token) {
    source = new HAClient({ url: cfg.haUrl, token: cfg.token, entityMap: buildEntityMap(), onPatch, onStatus });
  } else {
    source = new DemoSource(DEVICES, onPatch, onStatus);
  }
  source.connect();
}

function onDeviceClick(id) {
  const d = devices.get(id);
  if (!d) return;
  if (source instanceof DemoSource) source.toggle(id);
  else {
    const entity = d.cfg.type === 'outlet' ? d.cfg.switch : d.cfg.entity;
    if (entity) source.toggle(entity).catch((e) => console.warn('toggle', e));
  }
}

// -----------------------------------------------------------------------------
//  Panneau latéral
// -----------------------------------------------------------------------------
const totalEl = document.getElementById('total');
const costEl = document.getElementById('cost');
const energyEl = document.getElementById('energy');
const listOutlets = document.getElementById('list-outlets');
const listLights = document.getElementById('list-lights');
const spark = document.getElementById('spark');
const sparkCtx = spark.getContext('2d');
const history = [];
let dirty = true;

for (const d of devices.values()) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <button class="tog" title="Allumer / éteindre"></button>
    <div class="info">
      <div class="top"><span class="name">${d.cfg.type === 'outlet' ? d.cfg.icon ?? '🔌' : '💡'} ${d.cfg.name}</span><span class="w"></span></div>
      <div class="sub"><span class="room">${roomName(d.cfg.room)}</span><span class="kwh"></span></div>
      <div class="bar"><i></i></div>
    </div>`;
  row.querySelector('.tog').addEventListener('click', (e) => { e.stopPropagation(); onDeviceClick(d.cfg.id); });
  row.addEventListener('click', () => focusDevice(d));
  row.addEventListener('mouseenter', () => setHover(d.cfg.id));
  row.addEventListener('mouseleave', () => setHover(null));
  (d.cfg.type === 'outlet' ? listOutlets : listLights).appendChild(row);
  d.row = row;
}

function updatePanel() {
  let total = 0, energy = 0, totalOutlets = 0, totalLights = 0;
  let max = 1;
  for (const d of devices.values()) max = Math.max(max, d.state.power);
  for (const d of devices.values()) {
    const { power, on, energy: e } = d.state;
    total += power;
    energy += e;
    if (d.cfg.type === 'outlet') totalOutlets += power; else totalLights += power;
    const r = d.row;
    r.classList.toggle('off', !on);
    r.querySelector('.w').textContent = d.cfg.type === 'light' && !on ? 'off' : fmtW(power);
    r.querySelector('.kwh').textContent = `${fmtKwh(e)} ${d.energyFromSource ? '' : '· session'}`;
    const bar = r.querySelector('.bar i');
    bar.style.width = `${(power / max) * 100}%`;
    bar.style.background = d.cfg.type === 'outlet' ? `#${powerColor(power).getHexString()}` : '#ffd27a';
  }
  totalEl.textContent = fmtW(total);
  costEl.textContent = `≈ ${(total / 1000 * SETTINGS.pricePerKwh).toFixed(3)} ${SETTINGS.currency}/h`;
  energyEl.textContent = fmtKwh(energy);
  document.getElementById('sum-outlets').textContent = fmtW(totalOutlets);
  document.getElementById('sum-lights').textContent = fmtW(totalLights);
  return total;
}

function drawSpark() {
  const dpr = window.devicePixelRatio || 1;
  const w = spark.clientWidth, h = spark.clientHeight;
  if (spark.width !== w * dpr) { spark.width = w * dpr; spark.height = h * dpr; }
  sparkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sparkCtx.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const max = Math.max(100, ...history) * 1.1;
  const step = w / (120 - 1);
  const x0 = w - (history.length - 1) * step;
  sparkCtx.beginPath();
  history.forEach((v, i) => sparkCtx[i ? 'lineTo' : 'moveTo'](x0 + i * step, h - (v / max) * h));
  sparkCtx.strokeStyle = '#5fb3ff';
  sparkCtx.lineWidth = 1.5;
  sparkCtx.stroke();
  sparkCtx.lineTo(w, h); sparkCtx.lineTo(x0, h); sparkCtx.closePath();
  sparkCtx.fillStyle = 'rgba(95,179,255,0.15)';
  sparkCtx.fill();
}

// Échantillonnage 1 Hz : courbe + énergie de session (si pas de capteur kWh)
let lastSample = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - lastSample) / 1000;
  lastSample = now;
  for (const d of devices.values()) {
    if (!d.energyFromSource) d.state.energy += (d.state.power * dt) / 3600 / 1000;
  }
  history.push(updatePanel());
  if (history.length > 120) history.shift();
  drawSpark();
}, 1000);

// -----------------------------------------------------------------------------
//  Interaction 3D : survol / clic / focus caméra
// -----------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverId = null;
let downPos = null;

function setHover(id) {
  if (hoverId === id) return;
  if (hoverId) devices.get(hoverId)?.el.classList.remove('hover');
  hoverId = id;
  if (id) devices.get(id)?.el.classList.add('hover');
  labelRenderer.domElement.style.cursor = id ? 'pointer' : '';
  for (const d of devices.values()) d.row.classList.toggle('hover', d.cfg.id === id);
}

function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(pickables, false)[0]?.object.userData.deviceId ?? null;
}

labelRenderer.domElement.addEventListener('pointermove', (ev) => setHover(pick(ev)));
labelRenderer.domElement.addEventListener('pointerdown', (ev) => (downPos = [ev.clientX, ev.clientY]));
labelRenderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downPos || Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]) > 5) return;
  const id = pick(ev);
  if (id) onDeviceClick(id);
});

let focusTarget = null;
function focusDevice(d) {
  const pos = d.cfg.type === 'outlet'
    ? P(d.cfg.pos[0], 0.5, d.cfg.pos[2])
    : P(...(() => { const [x, z] = d.cfg.points[0]; return [x, 1, z]; })());
  focusTarget = pos;
}
document.getElementById('reset-view').addEventListener('click', () => {
  focusTarget = new THREE.Vector3(0, 0, 0);
  camera.position.set(0.5, 9.5, 6.5);
});

// Murs coupés / pleine hauteur
const wallsBtn = document.getElementById('walls');
let cutaway = store.get('cutaway') !== '0';
function applyWalls() {
  buildWalls(cutaway);
  wallsBtn.textContent = cutaway ? '🧱 Murs hauts' : '✂️ Coupe';
  store.set('cutaway', cutaway ? '1' : '0');
}
wallsBtn.addEventListener('click', () => { cutaway = !cutaway; applyWalls(); });
applyWalls();

// Jour / nuit
const nightBtn = document.getElementById('night');
let night = store.get('night') === '1';
function applyNight() {
  hemi.intensity = night ? 0.08 : 0.6;
  sun.intensity = night ? 0.05 : 1.2;
  nightBtn.textContent = night ? '☀️ Jour' : '🌙 Nuit';
  store.set('night', night ? '1' : '0');
}
nightBtn.addEventListener('click', () => { night = !night; applyNight(); });
applyNight();

// -----------------------------------------------------------------------------
//  Réglages Home Assistant
// -----------------------------------------------------------------------------
const dlg = document.getElementById('settings');
const urlInput = document.getElementById('ha-url');
const tokenInput = document.getElementById('ha-token');
const saved = {
  haUrl: store.get('ha_url') ?? SETTINGS.haUrl,
  token: store.get('ha_token') ?? SETTINGS.token,
};
document.getElementById('open-settings').addEventListener('click', () => {
  urlInput.value = saved.haUrl;
  tokenInput.value = saved.token;
  dlg.showModal();
});
document.getElementById('connect').addEventListener('click', (e) => {
  e.preventDefault();
  saved.haUrl = urlInput.value.trim();
  saved.token = tokenInput.value.trim();
  store.set('ha_url', saved.haUrl);
  store.set('ha_token', saved.token);
  dlg.close();
  startSource(saved);
});
document.getElementById('use-demo').addEventListener('click', (e) => {
  e.preventDefault();
  dlg.close();
  startSource({});
});

// -----------------------------------------------------------------------------
//  Boucle de rendu
// -----------------------------------------------------------------------------
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();

const clock = new THREE.Clock();
function loop() {
  const t = clock.getElapsedTime();
  if (focusTarget) {
    controls.target.lerp(focusTarget, 0.08);
    if (controls.target.distanceTo(focusTarget) < 0.01) focusTarget = null;
  }
  // légère pulsation des colonnes qui consomment beaucoup
  for (const d of devices.values()) {
    if (d.bar) d.bar.material.emissiveIntensity = 0.5 + (d.state.power > 1000 ? 0.4 * Math.sin(t * 6) + 0.4 : 0);
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(loop);
}

for (const d of devices.values()) renderDevice(d);
startSource(saved);
loop();
