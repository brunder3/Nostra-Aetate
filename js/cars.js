// Fahrzeug-/Motorprofile für die Motor-Synthese.
//
// Jeder Motor wird physikalisch inspiriert beschrieben: Zylinderzahl, Zündfolge,
// Bankzuordnung (welcher Zylinder in welchen Auspuffstrang bläst), Krümmerlängen,
// Rohr-Resonanzen, Schalldämpfer, Ansaugtrakt, Turbo/Kompressor usw.
// Die Klangcharakteristik (z. B. das "Blubbern" eines Cross-Plane-V8 oder das
// "Boxer-Grollen" eines Subaru) entsteht dadurch automatisch aus den ungleichen
// Abständen, mit denen die Abgasimpulse in den jeweiligen Strang gelangen.
//
// Die Fahrzeugnamen dienen nur zur Beschreibung des Klangvorbilds.

/**
 * Wandelt eine Zündfolge in Zündwinkel pro Zylinder um.
 * @param {number[]} order  Zündfolge (Zylindernummern ab 1)
 * @param {number} cycle    Arbeitsspiel in Kurbelwellengrad (720 = 4-Takt, 360 = Wankel)
 * @param {number[]} [intervals] optionale ungleiche Zündabstände
 */
function firing(order, cycle = 720, intervals = null) {
  const n = order.length;
  const angles = new Array(n).fill(0);
  let a = 0;
  order.forEach((cyl, k) => {
    angles[cyl - 1] = a;
    a += intervals ? intervals[k] : cycle / n;
  });
  return angles;
}

/** Bankzuordnung: Liste der Zylinder (ab 1), die in Bank 0 blasen; Rest Bank 1. */
function banks(n, bank0) {
  const b = new Array(n).fill(1);
  bank0.forEach((c) => (b[c - 1] = 0));
  return b;
}

/** Krümmerlaufzeiten (ms) – leicht unterschiedlich, damit es nicht steril klingt. */
function headers(n, base = 1.0, spread = 0.18, seed = 1) {
  const out = [];
  let s = seed * 9301 + 49297;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(base + (s / 233280 - 0.5) * 2 * spread);
  }
  return out;
}

const TIRE = 2.05; // Abrollumfang in m (ca. 20"-Rad, sportliche Reifen)

export const CARS = [
  // ======================= Favoriten =======================
  {
    id: 'f1-v8',
    fav: true,
    name: 'Formel 1 V8 · 2010–2013',
    sub: '2.4 V8 · Flachkurbelwelle · 18.000 U/min',
    inspired: 'F1 2010–2013 (Red Bull, Ferrari, McLaren)',
    color: '#1e5bc6',
    engine: {
      cyl: 8, cycle: 720,
      // F1-V8: 90°-V mit Flachkurbelwelle -> jede Bank zündet gleichmäßig alle 180°
      fire: firing([1, 5, 3, 7, 4, 8, 2, 6]),
      bank: banks(8, [1, 2, 3, 4]),
      header: headers(8, 0.55, 0.05, 43),
      idle: 4600, redline: 18000, limiter: 18150,
      pulseW: 10.5, noise: 0.3, rough: 0.035, lope: 0.14, wobble: 0.022, rasp: 1.0,
      pipe: { colMs: 0.5, colFb: -0.3, mainMs: 2.5, mainFb: -0.42, damp: 8500 },
      muffler: { cutoff: 9000, valveCutoff: 12500, resHz: 520, resDb: 3, q: 1.0 },
      cross: 0.35,
      intake: { level: 0.38, hz: 1700, q: 1.4, helm: 640 },
      mech: 0.22,
      whine: { level: 0.22, order: 31, overrun: 1 },
      overrunMode: 'blown',
      turbo: null,
      pops: 0.75, gain: 1.15,
    },
    gearbox: {
      ratios: [5.58, 4.30, 3.50, 2.95, 2.50, 2.13, 1.75], final: 4.0, tire: 2.07, shift: 0.035, type: 'Seamless-Shift',
      shiftMin: 0.6, brakeDown: 0.72, gap: 0.15, launch: 0.6,
    },
  },
  {
    id: 'gt3-flat6',
    fav: true,
    name: 'Porsche 911 GT3 (992)',
    sub: '4.0 Sechszylinder-Boxer · Saugmotor · 9.000 U/min',
    inspired: 'Porsche 911 GT3 (992) mit PDK',
    color: '#f2c200',
    engine: {
      cyl: 6, cycle: 720,
      // Boxer-6: Zündfolge 1-6-2-4-3-5, jede Bank (1-3 / 4-6) zündet alle 240°
      fire: firing([1, 6, 2, 4, 3, 5]),
      bank: banks(6, [1, 2, 3]),
      header: [0.82, 0.9, 0.97, 0.86, 0.93, 1.0],
      idle: 880, redline: 9000, limiter: 9050,
      pulseW: 16, noise: 0.22, rough: 0.045, lope: 0.04, rasp: 0.95,
      pipe: { colMs: 0.95, colFb: -0.3, mainMs: 6.2, mainFb: -0.42, damp: 5200 },
      muffler: { cutoff: 2600, valveCutoff: 6800, resHz: 205, resDb: 5, q: 1.2 },
      cross: 0.32,
      // Einzeldrosselklappen + Resonanzklappe: ab ~5.800 U/min wird der Ansaugschrei deutlich härter
      intake: { level: 0.6, hz: 980, q: 1.6, helm: 300, switchRpm: 5800, level2: 1.75, helm2: 430, noise: 0.4 },
      mech: 0.16,
      whine: { level: 0.05, order: 27, overrun: 0.6 },
      turbo: null,
      pops: 0.4, gain: 1.01,
    },
    gearbox: {
      ratios: [3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84], final: 4.89, tire: 2.27, shift: 0.08, type: 'PDK',
      shiftMin: 0.32, brakeDown: 0.5, gap: 0.28, launch: 0.42,
    },
  },
  {
    id: 'f1-v6',
    fav: true,
    name: 'Formel 1 V6 Turbo-Hybrid · 2014',
    sub: '1.6 V6 · Turbo + MGU-H/K · 12.000 U/min',
    inspired: 'F1-Hybrid-Ära ab 2014',
    color: '#00a19c',
    engine: {
      cyl: 6, cycle: 720,
      fire: firing([1, 4, 2, 5, 3, 6]),
      bank: banks(6, [1, 2, 3]), single: true, // beide Bänke -> ein Turbo -> ein Endrohr
      header: headers(6, 0.9, 0.08, 47),
      idle: 4200, redline: 12000, limiter: 12300,
      pulseW: 15, noise: 0.48, rough: 0.04, lope: 0.08, wobble: 0.02, rasp: 0.65,
      pipe: { colMs: 1.0, colFb: -0.34, mainMs: 4.4, mainFb: -0.48, damp: 5000 },
      muffler: { cutoff: 3600, valveCutoff: 5200, resHz: 300, resDb: 4, q: 1.1 },
      cross: 0.0,
      intake: { level: 0.15, hz: 1200, q: 1.3, helm: 450 },
      mech: 0.16,
      whine: { level: 0.45, order: 23, overrun: 1 }, // MGU-K beim Rekuperieren
      turbo: { level: 0.95, spool: 6200, f0: 2800, f1: 8200, bov: null, hold: 1.8 },
      pops: 0.12, gain: 1.11,
    },
    gearbox: {
      ratios: [4.26, 3.57, 3.0, 2.51, 2.11, 1.77, 1.49, 1.25], final: 3.5, tire: 2.07, shift: 0.035, type: 'Seamless-Shift',
      shiftMin: 0.6, brakeDown: 0.66, gap: 0.15, launch: 0.6,
    },
  },
  {
    id: 'f1-v12',
    fav: true,
    name: 'Formel 1 V12 · 1990er',
    sub: '3.0 V12 · 17.000 U/min',
    inspired: 'Ferrari-F1-V12 (ca. 1995)',
    color: '#d40000',
    engine: {
      cyl: 12, cycle: 720,
      fire: firing([1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10]),
      bank: banks(12, [1, 2, 3, 4, 5, 6]),
      header: headers(12, 0.5, 0.05, 53),
      idle: 4000, redline: 17000, limiter: 17200,
      pulseW: 9.5, noise: 0.26, rough: 0.025, lope: 0.08, wobble: 0.02, rasp: 1.0,
      pipe: { colMs: 0.45, colFb: -0.3, mainMs: 2.3, mainFb: -0.42, damp: 9500 },
      muffler: { cutoff: 9500, valveCutoff: 13500, resHz: 620, resDb: 3, q: 1.0 },
      cross: 0.3,
      intake: { level: 0.45, hz: 1900, q: 1.4, helm: 720 },
      mech: 0.2,
      whine: { level: 0.2, order: 29, overrun: 1 },
      turbo: null,
      pops: 0.3, gain: 1.21,
    },
    gearbox: {
      ratios: [5.27, 4.15, 3.27, 2.58, 2.03, 1.6], final: 4.0, tire: 2.07, shift: 0.06, type: 'Halbautomatik',
      shiftMin: 0.6, brakeDown: 0.7, gap: 0.18, launch: 0.6,
    },
  },
  // ======================= weitere Fahrzeuge =======================
  {
    id: 'amg-v8',
    name: 'AMG V8 Biturbo',
    sub: '4.0 V8 · Cross-Plane · 2 Turbos',
    inspired: 'Mercedes-AMG GT / C63',
    color: '#c0c6cc',
    engine: {
      cyl: 8, cycle: 720,
      fire: firing([1, 5, 4, 8, 6, 3, 7, 2]),
      bank: banks(8, [1, 2, 3, 4]),
      header: headers(8, 1.1, 0.2, 3),
      idle: 750, redline: 7000, limiter: 7200,
      pulseW: 30, noise: 0.42, rough: 0.07, lope: 0.08, rasp: 0.55,
      pipe: { colMs: 1.6, colFb: -0.38, mainMs: 11.5, mainFb: -0.56, damp: 2600 },
      muffler: { cutoff: 2300, valveCutoff: 4200, resHz: 120, resDb: 7, q: 1.1 },
      cross: 0.22,
      intake: { level: 0.22, hz: 620, q: 1.3, helm: 170 },
      mech: 0.08,
      turbo: { level: 0.32, spool: 2400, f0: 2200, f1: 7200, bov: 'psh' },
      pops: 0.95, gain: 0.77,
    },
    gearbox: { ratios: [3.40, 2.19, 1.63, 1.29, 1.03, 0.84, 0.63], final: 3.67, tire: TIRE, shift: 0.11, type: 'DCT' },
  },
  {
    id: 'mustang-v8',
    name: 'Muscle V8 Sauger',
    sub: '5.0 V8 · Cross-Plane · Saugmotor',
    inspired: 'Ford Mustang GT',
    color: '#2f6fd6',
    engine: {
      cyl: 8, cycle: 720,
      fire: firing([1, 5, 4, 8, 6, 3, 7, 2]),
      bank: banks(8, [1, 2, 3, 4]),
      header: headers(8, 1.3, 0.25, 7),
      idle: 700, redline: 7400, limiter: 7500,
      pulseW: 34, noise: 0.36, rough: 0.08, lope: 0.22, rasp: 0.45,
      pipe: { colMs: 1.9, colFb: -0.42, mainMs: 14.5, mainFb: -0.6, damp: 2200 },
      muffler: { cutoff: 2000, valveCutoff: 3800, resHz: 95, resDb: 8, q: 1.0 },
      cross: 0.15,
      intake: { level: 0.32, hz: 520, q: 1.2, helm: 140 },
      mech: 0.1,
      turbo: null,
      pops: 0.45, gain: 0.97,
    },
    gearbox: { ratios: [3.66, 2.43, 1.69, 1.32, 1.00, 0.65], final: 3.55, tire: TIRE, shift: 0.32, type: 'Manuell' },
  },
  {
    id: 'hellcat',
    name: 'Supercharged V8',
    sub: '6.2 V8 · Kompressor-Heulen',
    inspired: 'Dodge Challenger SRT Hellcat',
    color: '#d33a2c',
    engine: {
      cyl: 8, cycle: 720,
      fire: firing([1, 8, 4, 3, 6, 5, 7, 2]),
      bank: banks(8, [1, 3, 5, 7]),
      header: headers(8, 1.4, 0.22, 11),
      idle: 680, redline: 6200, limiter: 6300,
      pulseW: 36, noise: 0.38, rough: 0.08, lope: 0.18, rasp: 0.4,
      pipe: { colMs: 2.0, colFb: -0.42, mainMs: 15.5, mainFb: -0.6, damp: 2100 },
      muffler: { cutoff: 1900, valveCutoff: 3600, resHz: 85, resDb: 8, q: 1.0 },
      cross: 0.18,
      intake: { level: 0.25, hz: 480, q: 1.2, helm: 130 },
      mech: 0.08,
      turbo: null,
      supercharger: { level: 0.5, ratio: 17 },
      pops: 0.4, gain: 0.95,
    },
    gearbox: { ratios: [4.71, 3.14, 2.10, 1.67, 1.29, 1.00, 0.84, 0.67], final: 2.62, tire: TIRE, shift: 0.18, type: 'Automatik' },
  },
  {
    id: 'ferrari-v12',
    name: 'Ferrari V12',
    sub: '6.5 V12 · Saugmotor · 8.900 U/min',
    inspired: 'Ferrari 812 Superfast',
    color: '#e0201b',
    engine: {
      cyl: 12, cycle: 720,
      fire: firing([1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10]),
      bank: banks(12, [1, 2, 3, 4, 5, 6]),
      header: headers(12, 0.8, 0.12, 5),
      idle: 950, redline: 8900, limiter: 9000,
      pulseW: 19, noise: 0.3, rough: 0.04, lope: 0.0, rasp: 0.85,
      pipe: { colMs: 1.0, colFb: -0.32, mainMs: 7.0, mainFb: -0.5, damp: 4200 },
      muffler: { cutoff: 3600, valveCutoff: 7000, resHz: 200, resDb: 4, q: 1.2 },
      cross: 0.3,
      intake: { level: 0.42, hz: 900, q: 1.5, helm: 260 },
      mech: 0.12,
      turbo: null,
      pops: 0.3, gain: 1.11,
    },
    gearbox: { ratios: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.56, tire: TIRE, shift: 0.08, type: 'DCT' },
  },
  {
    id: 'ferrari-v8',
    name: 'Flat-Plane V8',
    sub: '4.5 V8 · Flachkurbelwelle · 9.000 U/min',
    inspired: 'Ferrari 458 Italia',
    color: '#ff2a1a',
    engine: {
      cyl: 8, cycle: 720,
      fire: firing([1, 5, 3, 7, 4, 8, 2, 6]),
      bank: banks(8, [1, 2, 3, 4]),
      header: headers(8, 0.9, 0.12, 13),
      idle: 1000, redline: 9000, limiter: 9100,
      pulseW: 20, noise: 0.32, rough: 0.05, lope: 0.0, rasp: 0.9,
      pipe: { colMs: 1.1, colFb: -0.35, mainMs: 7.5, mainFb: -0.5, damp: 4000 },
      muffler: { cutoff: 3400, valveCutoff: 6500, resHz: 180, resDb: 5, q: 1.2 },
      cross: 0.25,
      intake: { level: 0.4, hz: 850, q: 1.5, helm: 240 },
      mech: 0.12,
      turbo: null,
      pops: 0.55, gain: 1.58,
    },
    gearbox: { ratios: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.44, tire: TIRE, shift: 0.08, type: 'DCT' },
  },
  {
    id: 'huracan-v10',
    name: 'Lamborghini V10',
    sub: '5.2 V10 · Saugmotor · 8.500 U/min',
    inspired: 'Lamborghini Huracán',
    color: '#9bd400',
    engine: {
      cyl: 10, cycle: 720,
      fire: firing([1, 6, 5, 10, 2, 7, 3, 8, 4, 9]),
      bank: banks(10, [1, 2, 3, 4, 5]),
      header: headers(10, 1.0, 0.15, 17),
      idle: 950, redline: 8500, limiter: 8600,
      pulseW: 22, noise: 0.36, rough: 0.05, lope: 0.0, rasp: 0.8,
      pipe: { colMs: 1.2, colFb: -0.36, mainMs: 8.5, mainFb: -0.52, damp: 3600 },
      muffler: { cutoff: 3000, valveCutoff: 6000, resHz: 160, resDb: 6, q: 1.1 },
      cross: 0.25,
      intake: { level: 0.38, hz: 800, q: 1.4, helm: 220 },
      mech: 0.1,
      turbo: null,
      pops: 0.85, gain: 0.84,
    },
    gearbox: { ratios: [3.13, 2.13, 1.62, 1.29, 1.05, 0.87, 0.72], final: 4.38, tire: TIRE, shift: 0.09, type: 'DCT' },
  },
  {
    id: 'm3-i6',
    name: 'BMW M Reihensechser',
    sub: '3.2 R6 · Saugmotor · 8.000 U/min',
    inspired: 'BMW M3 E46 (S54)',
    color: '#1c69d4',
    engine: {
      cyl: 6, cycle: 720,
      fire: firing([1, 5, 3, 6, 2, 4]),
      bank: banks(6, [1, 2, 3]),
      header: headers(6, 1.0, 0.14, 23),
      idle: 850, redline: 7900, limiter: 8000,
      pulseW: 22, noise: 0.34, rough: 0.05, lope: 0.0, rasp: 0.7,
      pipe: { colMs: 1.3, colFb: -0.35, mainMs: 9.0, mainFb: -0.52, damp: 3400 },
      muffler: { cutoff: 2800, valveCutoff: 5200, resHz: 160, resDb: 5, q: 1.1 },
      cross: 0.6,
      intake: { level: 0.5, hz: 780, q: 1.5, helm: 230 },
      mech: 0.12,
      turbo: null,
      pops: 0.35, gain: 1.14,
    },
    gearbox: { ratios: [4.23, 2.53, 1.67, 1.23, 1.00, 0.83], final: 3.62, tire: TIRE, shift: 0.28, type: 'Manuell' },
  },
  {
    id: 'supra-2jz',
    name: 'Supra 2JZ Turbo',
    sub: '3.0 R6 · Twin-Turbo · Blow-Off',
    inspired: 'Toyota Supra MK4',
    color: '#ff7a00',
    engine: {
      cyl: 6, cycle: 720,
      fire: firing([1, 5, 3, 6, 2, 4]),
      bank: banks(6, [1, 2, 3, 4, 5, 6]), single: true,
      header: headers(6, 1.1, 0.14, 29),
      idle: 800, redline: 7000, limiter: 7100,
      pulseW: 26, noise: 0.4, rough: 0.06, lope: 0.03, rasp: 0.6,
      pipe: { colMs: 1.5, colFb: -0.38, mainMs: 10.5, mainFb: -0.55, damp: 2900 },
      muffler: { cutoff: 2500, valveCutoff: 4800, resHz: 140, resDb: 6, q: 1.1 },
      cross: 0.0,
      intake: { level: 0.25, hz: 700, q: 1.3, helm: 200 },
      mech: 0.1,
      turbo: { level: 0.7, spool: 3200, f0: 1800, f1: 6500, bov: 'psh' },
      pops: 0.5, gain: 0.75,
    },
    gearbox: { ratios: [3.83, 2.36, 1.69, 1.31, 1.00, 0.79], final: 3.27, tire: TIRE, shift: 0.3, type: 'Manuell' },
  },
  {
    id: 'rs3-i5',
    name: 'Audi Fünfzylinder',
    sub: '2.5 TFSI R5 · Turbo · 1-2-4-5-3',
    inspired: 'Audi RS3',
    color: '#bb0a30',
    engine: {
      cyl: 5, cycle: 720,
      fire: firing([1, 2, 4, 5, 3]),
      bank: banks(5, [1, 2, 3, 4, 5]), single: true,
      header: headers(5, 1.1, 0.3, 31),
      idle: 800, redline: 7000, limiter: 7100,
      pulseW: 26, noise: 0.42, rough: 0.07, lope: 0.04, rasp: 0.65,
      pipe: { colMs: 1.6, colFb: -0.4, mainMs: 10.0, mainFb: -0.56, damp: 2800 },
      muffler: { cutoff: 2500, valveCutoff: 4800, resHz: 130, resDb: 6, q: 1.1 },
      cross: 0.0,
      intake: { level: 0.25, hz: 680, q: 1.3, helm: 190 },
      mech: 0.1,
      turbo: { level: 0.4, spool: 2600, f0: 2000, f1: 7000, bov: 'flutter' },
      pops: 0.9, gain: 0.46,
    },
    gearbox: { ratios: [3.56, 2.75, 1.79, 1.26, 0.94, 0.79, 0.64], final: 3.4, tire: TIRE, shift: 0.1, type: 'DCT' },
  },
  {
    id: 'sti-boxer4',
    name: 'Subaru Boxer-Grollen',
    sub: '2.5 Boxer-4 · ungleiche Krümmer · Turbo',
    inspired: 'Subaru Impreza WRX STI',
    color: '#1f4fa0',
    engine: {
      cyl: 4, cycle: 720,
      fire: firing([1, 3, 2, 4]),
      bank: banks(4, [1, 2, 3, 4]), single: true,
      // Ungleich lange Krümmer -> Abgasimpulse kommen ungleichmäßig an = typisches Grollen
      header: [0.5, 3.4, 1.2, 4.6],
      idle: 800, redline: 6700, limiter: 6800,
      pulseW: 32, noise: 0.45, rough: 0.09, lope: 0.1, rasp: 0.5,
      pipe: { colMs: 1.8, colFb: -0.4, mainMs: 12.0, mainFb: -0.58, damp: 2400 },
      muffler: { cutoff: 2300, valveCutoff: 4400, resHz: 110, resDb: 7, q: 1.1 },
      cross: 0.0,
      intake: { level: 0.25, hz: 620, q: 1.3, helm: 170 },
      mech: 0.12,
      turbo: { level: 0.55, spool: 3000, f0: 1700, f1: 6200, bov: 'flutter' },
      pops: 0.6, gain: 0.57,
    },
    gearbox: { ratios: [3.64, 2.38, 1.76, 1.35, 0.97, 0.76], final: 3.9, tire: TIRE, shift: 0.3, type: 'Manuell' },
  },
  {
    id: 'rx7-rotary',
    name: 'Wankel Twin-Rotor',
    sub: '13B Zweischeiben-Wankel · Turbo · Brap',
    inspired: 'Mazda RX-7 FD',
    color: '#c8102e',
    engine: {
      cyl: 2, cycle: 360,
      fire: [0, 180],
      bank: [0, 0], single: true,
      header: [0.8, 1.0],
      idle: 850, redline: 8000, limiter: 8200,
      pulseW: 13, noise: 0.55, rough: 0.12, lope: 0.28, rasp: 0.9,
      pipe: { colMs: 1.3, colFb: -0.35, mainMs: 9.0, mainFb: -0.5, damp: 3800 },
      muffler: { cutoff: 3000, valveCutoff: 6000, resHz: 170, resDb: 5, q: 1.2 },
      cross: 0.0,
      intake: { level: 0.3, hz: 760, q: 1.3, helm: 210 },
      mech: 0.05,
      turbo: { level: 0.5, spool: 3200, f0: 1900, f1: 6800, bov: 'psh' },
      pops: 0.8, gain: 1.22,
    },
    gearbox: { ratios: [3.48, 2.02, 1.39, 1.00, 0.72], final: 4.1, tire: TIRE, shift: 0.28, type: 'Manuell' },
  },
  {
    id: 'gtr-v6',
    name: 'GT-R V6 Biturbo',
    sub: '3.8 V6 · Twin-Turbo',
    inspired: 'Nissan GT-R R35',
    color: '#8a8f96',
    engine: {
      cyl: 6, cycle: 720,
      fire: firing([1, 2, 3, 4, 5, 6]),
      bank: banks(6, [1, 3, 5]),
      header: headers(6, 1.0, 0.15, 37),
      idle: 800, redline: 7100, limiter: 7200,
      pulseW: 25, noise: 0.42, rough: 0.06, lope: 0.0, rasp: 0.6,
      pipe: { colMs: 1.4, colFb: -0.36, mainMs: 10.0, mainFb: -0.54, damp: 3000 },
      muffler: { cutoff: 2600, valveCutoff: 5000, resHz: 140, resDb: 5, q: 1.1 },
      cross: 0.3,
      intake: { level: 0.25, hz: 700, q: 1.3, helm: 200 },
      mech: 0.1,
      turbo: { level: 0.6, spool: 2800, f0: 2000, f1: 7400, bov: 'psh' },
      pops: 0.45, gain: 0.87,
    },
    gearbox: { ratios: [4.06, 2.30, 1.59, 1.25, 1.00, 0.80], final: 3.70, tire: TIRE, shift: 0.1, type: 'DCT' },
  },
  {
    id: 'f1-v10',
    name: 'Formel 1 V10 · 2004',
    sub: '3.0 V10 · 19.000 U/min · 2000er-Ära',
    inspired: 'F1 V10 (ca. 2004)',
    color: '#e10600',
    engine: {
      cyl: 10, cycle: 720,
      fire: firing([1, 6, 5, 10, 2, 7, 3, 8, 4, 9]),
      bank: banks(10, [1, 2, 3, 4, 5]),
      header: headers(10, 0.5, 0.06, 41),
      idle: 4200, redline: 19000, limiter: 19200,
      pulseW: 11, noise: 0.28, rough: 0.03, lope: 0.0, rasp: 1.0,
      pipe: { colMs: 0.6, colFb: -0.3, mainMs: 3.2, mainFb: -0.45, damp: 7000 },
      muffler: { cutoff: 7000, valveCutoff: 11000, resHz: 400, resDb: 3, q: 1.0 },
      cross: 0.3,
      intake: { level: 0.4, hz: 1500, q: 1.5, helm: 500 },
      mech: 0.18,
      turbo: null,
      pops: 0.25, gain: 1.30,
    },
    gearbox: { ratios: [5.32, 4.0, 3.2, 2.65, 2.2, 1.95, 1.77], final: 4.0, tire: 2.07, shift: 0.04, type: 'Halbautomatik', shiftMin: 0.6, brakeDown: 0.72, gap: 0.15, launch: 0.6 },
  },
];

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}
