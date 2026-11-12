// =============================================================================
//  CONFIGURATION DU STUDIO
//  - PLAN : géométrie (pièces, murs, fenêtres, meubles), en mètres.
//    Repère : x = largeur (gauche → droite), z = profondeur (haut → bas du plan).
//  - DEVICES : prises et groupes de lampes, avec les entités Home Assistant.
//    Remplace les entity_id par les tiens (Paramètres > Appareils > Entités).
// =============================================================================

export const SETTINGS = {
  // Laisser vide = mode démo. Peut aussi être saisi dans l'interface (⚙).
  haUrl: '',            // ex : 'http://homeassistant.local:8123'
  token: '',            // jeton d'accès longue durée (Profil > Sécurité)
  pricePerKwh: 0.2516,  // tarif électricité (€/kWh)
  currency: '€',
};

export const PLAN = {
  width: 7,
  depth: 5,
  wallHeight: 2.5,
  cutHeight: 1.1,        // hauteur des murs en vue "coupe" (maison de poupée)
  wallThickness: 0.1,

  rooms: [
    { id: 'sejour',  name: 'Séjour / Nuit', x: 0,   z: 0,   w: 4.5, d: 5,   color: '#b89f7e' },
    { id: 'cuisine', name: 'Cuisine',       x: 4.5, z: 0,   w: 2.5, d: 2.6, color: '#cfd2cf' },
    { id: 'entree',  name: 'Entrée',        x: 4.5, z: 2.6, w: 1.0, d: 2.4, color: '#a89c8c' },
    { id: 'sdb',     name: 'Salle de bain', x: 5.5, z: 2.6, w: 1.5, d: 2.4, color: '#9fbcc4' },
  ],

  // [x1, z1, x2, z2, hauteur?]  (les trous = portes)
  walls: [
    // Extérieurs
    [0, 0, 1.2, 0], [3.2, 0, 7, 0],          // nord (fenêtre entre 1.2 et 3.2)
    [7, 0, 7, 5],                             // est
    [7, 5, 5.3, 5], [4.7, 5, 0, 5],           // sud (porte d'entrée 4.7 → 5.3)
    [0, 5, 0, 0],                             // ouest
    // Intérieurs
    [4.5, 0, 4.5, 2.6, 1.05],                 // bar cuisine (mi-hauteur)
    [4.5, 3.5, 4.5, 5],                       // séjour | entrée (passage 2.6 → 3.5)
    [5.5, 2.6, 7, 2.6],                       // cuisine | sdb
    [5.5, 2.6, 5.5, 3.0], [5.5, 3.8, 5.5, 5], // entrée | sdb (porte 3.0 → 3.8)
  ],

  windows: [
    { x1: 1.2, z1: 0, x2: 3.2, z2: 0, sill: 0.9, top: 2.2 },
  ],

  furniture: [
    // Séjour / nuit
    { name: 'Lit',          x: 0.15, z: 0.15, w: 1.6,  d: 2.0,  h: 0.45, color: '#e9e4da' },
    { name: 'Chevet',       x: 1.8,  z: 0.15, w: 0.4,  d: 0.4,  h: 0.5,  color: '#7a5c3e' },
    { name: 'Bureau',       x: 2.7,  z: 0.1,  w: 1.2,  d: 0.6,  h: 0.75, color: '#8a6a4a' },
    { name: 'Canapé',       x: 0.15, z: 3.0,  w: 0.85, d: 1.8,  h: 0.8,  color: '#4f6d8f' },
    { name: 'Table basse',  x: 1.4,  z: 3.5,  w: 0.6,  d: 0.8,  h: 0.4,  color: '#7a5c3e' },
    { name: 'Meuble TV',    x: 4.05, z: 3.7,  w: 0.4,  d: 1.2,  h: 0.5,  color: '#3b3b3b' },
    { name: 'TV',           x: 4.38, z: 3.85, w: 0.05, d: 0.9,  h: 0.55, y: 0.75, color: '#111111' },
    // Cuisine
    { name: 'Plan de travail', x: 4.6, z: 0.05, w: 1.7, d: 0.6, h: 0.9,  color: '#e4e0d8' },
    { name: 'Frigo',        x: 6.3,  z: 0.05, w: 0.65, d: 0.65, h: 1.85, color: '#f2f2f2' },
    // Entrée
    { name: 'Meuble à chaussures', x: 4.55, z: 3.7, w: 0.3, d: 1.0, h: 0.9, color: '#6b5a48' },
    // Salle de bain
    { name: 'Lave-linge',   x: 6.35, z: 2.65, w: 0.6,  d: 0.6,  h: 0.85, color: '#f5f5f5' },
    { name: 'WC',           x: 6.5,  z: 3.35, w: 0.45, d: 0.6,  h: 0.45, color: '#ffffff' },
    { name: 'Douche',       x: 6.15, z: 4.15, w: 0.8,  d: 0.8,  h: 0.08, color: '#dfe9ec' },
    { name: 'Lavabo',       x: 5.55, z: 4.5,  w: 0.55, d: 0.45, h: 0.85, color: '#ffffff' },
  ],
};

// -----------------------------------------------------------------------------
//  APPAREILS
//  outlet : pos [x, hauteur, z] + normal [nx, nz] (direction vers la pièce)
//           power  = capteur de puissance (W)       ex. sensor.prise_tv_power
//           switch = interrupteur de la prise         ex. switch.prise_tv
//           energy = capteur d'énergie (kWh, option)  ex. sensor.prise_tv_energy
//  light  : points [[x, z], ...] = emplacement des lampes du groupe
//           entity = groupe de lampes HA              ex. light.sejour
//           power  = capteur de puissance (option, sinon estimé via nominalW)
//  demo   : profil de consommation simulé en mode démo
// -----------------------------------------------------------------------------
export const DEVICES = [
  // ---------- Prises ----------
  { id: 'prise_tv', type: 'outlet', name: 'TV & box', icon: '📺', room: 'sejour',
    pos: [4.45, 0.3, 4.6], normal: [-1, 0],
    power: 'sensor.prise_tv_power', switch: 'switch.prise_tv', energy: 'sensor.prise_tv_energy',
    demo: { kind: 'tv', on: true } },

  { id: 'prise_bureau', type: 'outlet', name: 'PC bureau', icon: '🖥️', room: 'sejour',
    pos: [3.6, 0.3, 0.05], normal: [0, 1],
    power: 'sensor.prise_bureau_power', switch: 'switch.prise_bureau',
    demo: { kind: 'pc', on: true } },

  { id: 'prise_chevet', type: 'outlet', name: 'Chevet', icon: '🔌', room: 'sejour',
    pos: [2.15, 0.3, 0.05], normal: [0, 1],
    power: 'sensor.prise_chevet_power', switch: 'switch.prise_chevet',
    demo: { kind: 'standby', on: true } },

  { id: 'prise_frigo', type: 'outlet', name: 'Frigo', icon: '🧊', room: 'cuisine',
    pos: [6.95, 0.3, 1.0], normal: [-1, 0],
    power: 'sensor.prise_frigo_power', switch: 'switch.prise_frigo',
    demo: { kind: 'fridge', on: true } },

  { id: 'prise_plaques', type: 'outlet', name: 'Plaques', icon: '🍳', room: 'cuisine',
    pos: [5.0, 1.1, 0.05], normal: [0, 1],
    power: 'sensor.prise_plaques_power', switch: 'switch.prise_plaques',
    demo: { kind: 'cooking', on: false } },

  { id: 'prise_bouilloire', type: 'outlet', name: 'Bouilloire', icon: '☕', room: 'cuisine',
    pos: [5.9, 1.1, 0.05], normal: [0, 1],
    power: 'sensor.prise_bouilloire_power', switch: 'switch.prise_bouilloire',
    demo: { kind: 'kettle', on: true } },

  { id: 'prise_lave_linge', type: 'outlet', name: 'Lave-linge', icon: '🧺', room: 'sdb',
    pos: [6.95, 0.5, 3.0], normal: [-1, 0],
    power: 'sensor.prise_lave_linge_power', switch: 'switch.prise_lave_linge',
    demo: { kind: 'washer', on: true } },

  { id: 'prise_seche_serviette', type: 'outlet', name: 'Sèche-serviettes', icon: '♨️', room: 'sdb',
    pos: [5.56, 1.0, 4.1], normal: [1, 0],
    power: 'sensor.seche_serviette_power', switch: 'switch.seche_serviette',
    demo: { kind: 'heater', on: true } },

  // ---------- Groupes de lampes ----------
  { id: 'lum_sejour', type: 'light', name: 'Séjour', room: 'sejour',
    points: [[1.4, 3.9], [3.0, 3.9]], entity: 'light.sejour', power: 'sensor.lumieres_sejour_power',
    nominalW: 2 * 9, color: '#ffd9a0', demo: { on: true, brightness: 200 } },

  { id: 'lum_nuit', type: 'light', name: 'Coin nuit', room: 'sejour',
    points: [[1.0, 1.2]], entity: 'light.coin_nuit',
    nominalW: 7, color: '#ffc78a', demo: { on: false, brightness: 120 } },

  { id: 'lum_bureau', type: 'light', name: 'Bureau', room: 'sejour',
    points: [[3.3, 0.8]], entity: 'light.bureau',
    nominalW: 6, color: '#f4f6ff', demo: { on: true, brightness: 255 } },

  { id: 'lum_cuisine', type: 'light', name: 'Cuisine', room: 'cuisine',
    points: [[5.2, 1.3], [6.3, 1.3]], entity: 'light.cuisine', power: 'sensor.lumieres_cuisine_power',
    nominalW: 2 * 6, color: '#fff3df', demo: { on: true, brightness: 255 } },

  { id: 'lum_entree', type: 'light', name: 'Entrée', room: 'entree',
    points: [[5.0, 3.9]], entity: 'light.entree',
    nominalW: 5, color: '#ffe2b8', demo: { on: false, brightness: 255 } },

  { id: 'lum_sdb', type: 'light', name: 'Salle de bain', room: 'sdb',
    points: [[6.0, 3.4], [6.55, 4.55]], entity: 'light.salle_de_bain',
    nominalW: 2 * 5, color: '#eef6ff', demo: { on: false, brightness: 255 } },
];
