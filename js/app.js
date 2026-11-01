import { CARS, getCar } from './cars.js';
import { Drivetrain } from './drivetrain.js';
import { GpsSpeed, DemoDrive } from './gps.js';
import { AudioEngine } from './audio.js';

const $ = (s) => document.querySelector(s);
const STORE = 'motorklang.v1';

const defaults = {
  carId: 'amg-v8',
  volume: 0.7,
  aggr: 0.6,
  pops: 0.6,
  bass: 3,
  treble: -2,
  valve: true,
  manual: false,
  mph: false,
  src: 'gps',
};
let S = { ...defaults };
try { S = { ...defaults, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch (e) { /* ignorieren */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ignorieren */ } };

// ---------------------------------------------------------------------------
// Fahrzeuge (Synthese + optionale Sound-Packs mit echten Aufnahmen)
// ---------------------------------------------------------------------------
const vehicles = CARS.map((c) => ({ ...c, kind: 'synth' }));

async function discoverPacks() {
  try {
    const res = await fetch('packs/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const idx = await res.json();
    for (const dir of idx.packs || []) {
      try {
        const r = await fetch(`packs/${dir}/pack.json`, { cache: 'no-cache' });
        if (!r.ok) continue;
        const p = await r.json();
        const base = getCar(p.base || 'amg-v8');
        const engine = { ...base.engine, ...(p.engine || {}) };
        ['idle', 'redline', 'limiter'].forEach((k) => { if (p[k]) engine[k] = p[k]; });
        vehicles.push({
          id: 'pack:' + dir,
          kind: 'pack',
          dir,
          pack: p,
          name: p.name || dir,
          sub: p.sub || 'Echte Aufnahme',
          inspired: p.credit || '',
          color: p.color || base.color,
          engine,
          gearbox: { ...base.gearbox, ...(p.gearbox || {}) },
        });
      } catch (e) { console.warn('Pack', dir, e); }
    }
  } catch (e) { /* keine Packs vorhanden */ }
}

// ---------------------------------------------------------------------------
const audio = new AudioEngine();
const gps = new GpsSpeed();
const demo = new DemoDrive();
let demoPaused = false;
let current = vehicles.find((v) => v.id === S.carId) || vehicles[0];
const drive = new Drivetrain(current);
drive.aggr = S.aggr;
drive.manual = S.manual;

let running = false;
let pedal = 0;
let pedalHeld = false;
let lastState = { rpm: current.engine.idle, load: 0, gear: 1, v: 0, a: 0 };
let wakeLock = null;

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

function applyAccent() {
  document.documentElement.style.setProperty('--accent', current.color);
}

// ---------------------------------------------------------------------------
// Fahrzeugauswahl
// ---------------------------------------------------------------------------
function renderCars() {
  const grid = $('#carGrid');
  grid.innerHTML = '';
  for (const v of vehicles) {
    const b = document.createElement('button');
    b.className = 'car' + (v.id === current.id ? ' active' : '');
    b.style.setProperty('--c', v.color);
    b.innerHTML = `<b></b><span></span><i></i>${v.kind === 'pack' ? '<em class="tag">Aufnahme</em>' : ''}`;
    b.querySelector('b').textContent = v.name;
    b.querySelector('span').textContent = v.sub;
    b.querySelector('i').textContent = v.inspired ? `Klangvorbild: ${v.inspired}` : '';
    b.addEventListener('click', () => selectCar(v.id));
    grid.appendChild(b);
  }
  updateCarInfo();
}

function updateCarInfo() {
  const g = current.gearbox;
  $('#carInfo').textContent = `${g.ratios.length}-Gang ${g.type} · Begrenzer ${current.engine.limiter.toLocaleString('de-DE')} U/min`;
}

async function selectCar(id) {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  current = v;
  S.carId = id;
  save();
  drive.setCar(v);
  applyAccent();
  renderCars();
  if (audio.ready) await loadVehicleAudio();
}

async function loadVehicleAudio() {
  audio.post({ t: 'cfg', car: current.engine });
  pushSettings();
  if (current.kind === 'pack') {
    try {
      toast('Lade Aufnahmen …', 20000);
      const eng = await audio.loadPack(`packs/${current.dir}/`, current.pack, (p) => toast(`Lade Aufnahmen … ${Math.round(p * 100)} %`, 20000));
      eng.setRunning(running);
      audio.setSynthLevel(current.pack.mixSynth ?? 0.15);
      toast('Aufnahmen geladen');
    } catch (e) {
      console.error(e);
      audio.unloadPack();
      audio.setSynthLevel(1);
      toast('Aufnahmen konnten nicht geladen werden – nutze Synthese');
    }
  } else {
    audio.unloadPack();
    audio.setSynthLevel(1);
  }
}

function pushSettings() {
  audio.post({ t: 'set', pops: S.pops, valve: S.valve, bass: S.bass, treble: S.treble });
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------
async function toggleEngine() {
  const btn = $('#startBtn');
  if (!running) {
    try {
      btn.disabled = true;
      await audio.init();
      await audio.resume();
      audio.setVolume(S.volume);
      await loadVehicleAudio();
      running = true;
      audio.post({ t: 'run', on: true });
      audio.pack && audio.pack.setRunning(true);
      if (S.src === 'gps') gps.start();
      requestWakeLock();
    } catch (e) {
      console.error(e);
      toast('Audio konnte nicht gestartet werden: ' + e.message, 6000);
    } finally {
      btn.disabled = false;
    }
  } else {
    running = false;
    audio.post({ t: 'run', on: false });
    audio.pack && audio.pack.setRunning(false);
    releaseWakeLock();
  }
  btn.textContent = running ? 'Motor aus' : 'Motor starten';
  btn.classList.toggle('running', running);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* nicht unterstützt */ }
}
function releaseWakeLock() {
  try { wakeLock && wakeLock.release(); } catch (e) { /* egal */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) {
    requestWakeLock();
    audio.resume();
  }
});

// ---------------------------------------------------------------------------
// Hauptschleife (Steuerung ~60 Hz, unabhängig vom Zeichnen)
// ---------------------------------------------------------------------------
let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;

  pedal += ((pedalHeld ? 1 : 0) - pedal) * Math.min(1, dt * (pedalHeld ? 6 : 10));

  let v = 0, a = 0;
  if (S.src === 'demo') {
    if (demoPaused) {
      const target = Number($('#testSpeed').value) / 3.6;
      a = (target - lastState.v) * 1.5;
      a = Math.max(-8, Math.min(6, a));
      v = Math.max(0, lastState.v + a * dt);
    } else {
      ({ v, a } = demo.sample(dt));
    }
  } else {
    ({ v, a } = gps.sample(dt));
  }

  const st = drive.update(dt, v, a, pedal);
  if (running && audio.ready) {
    for (const ev of drive.takeEvents()) audio.post({ t: ev.type, ms: ev.ms });
    audio.post({ t: 'st', rpm: st.rpm, load: st.load });
    audio.pack && audio.pack.update(st.rpm, st.load);
  } else {
    drive.takeEvents();
  }
  lastState = { ...st, v, a };
}
setInterval(tick, 16);

// ---------------------------------------------------------------------------
// Drehzahlmesser
// ---------------------------------------------------------------------------
const cv = $('#tacho');
const g2 = cv.getContext('2d');
let shownRpm = 0;

function draw() {
  requestAnimationFrame(draw);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = g2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const e = current.engine;
  const maxRpm = Math.ceil((e.limiter * 1.04) / 1000) * 1000;
  const rpm = running ? lastState.rpm : 0;
  shownRpm += (rpm - shownRpm) * 0.35;

  const cx = w / 2, cy = h * 0.54;
  const r = Math.min(w * 0.46, h * 0.5);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (x) => a0 + (a1 - a0) * Math.min(1, Math.max(0, x / maxRpm));
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e0201b';

  // Grundbogen
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = '#20242c';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, a0, a1); ctx.stroke();
  // roter Bereich
  ctx.strokeStyle = '#5a1512';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, ang(e.redline), a1); ctx.stroke();
  // aktueller Wert
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, accent);
  ctx.strokeStyle = shownRpm > e.redline ? '#ff3b30' : grad;
  if (shownRpm > 10) { ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, a0, ang(shownRpm)); ctx.stroke(); }

  // Skala
  ctx.fillStyle = '#9aa3b2';
  ctx.font = `600 ${Math.round(r * 0.085)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = maxRpm > 12000 ? 2000 : 1000;
  for (let k = 0; k <= maxRpm; k += step / 2) {
    const an = ang(k);
    const major = k % step === 0;
    const r1 = r * (major ? 0.74 : 0.78), r2 = r * 0.81;
    ctx.strokeStyle = k >= e.redline ? '#ff4a3d' : '#59606d';
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1);
    ctx.lineTo(cx + Math.cos(an) * r2, cy + Math.sin(an) * r2);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = k >= e.redline ? '#ff6a5f' : '#9aa3b2';
      ctx.fillText(String(k / 1000), cx + Math.cos(an) * r * 0.63, cy + Math.sin(an) * r * 0.63);
    }
  }

  // Nadel
  const an = ang(shownRpm);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(an) * r * 0.2, cy + Math.sin(an) * r * 0.2);
  ctx.lineTo(cx + Math.cos(an) * r * 0.86, cy + Math.sin(an) * r * 0.86);
  ctx.stroke();

  // Gang
  const gearTxt = !running ? '–' : lastState.v < 0.4 && !drive.shift ? 'N' : String(drive.shift ? drive.shift.to : lastState.gear);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(r * 0.42)}px system-ui, sans-serif`;
  ctx.fillText(gearTxt, cx, cy - r * 0.05);

  // Tempo
  const sp = S.mph ? lastState.v * 2.23694 : lastState.v * 3.6;
  ctx.font = `700 ${Math.round(r * 0.17)}px system-ui, sans-serif`;
  ctx.fillText(`${Math.round(sp)}`, cx, cy + r * 0.3);
  ctx.fillStyle = '#7d8593';
  ctx.font = `600 ${Math.round(r * 0.07)}px system-ui, sans-serif`;
  ctx.fillText(S.mph ? 'mph' : 'km/h', cx, cy + r * 0.43);

  // Drehzahl + Last
  ctx.fillText(`${Math.round(shownRpm / 10) * 10} U/min`, cx, cy + r * 0.62);
  const lw = r * 0.6, lh = r * 0.035;
  ctx.fillStyle = '#20242c';
  ctx.fillRect(cx - lw / 2, cy + r * 0.72, lw, lh);
  ctx.fillStyle = accent;
  ctx.fillRect(cx - lw / 2, cy + r * 0.72, lw * (running ? lastState.load : 0), lh);
  ctx.fillStyle = '#5c6370';
  ctx.font = `600 ${Math.round(r * 0.055)}px system-ui, sans-serif`;
  ctx.fillText('LAST', cx, cy + r * 0.83);
}
requestAnimationFrame(draw);

// ---------------------------------------------------------------------------
// GPS-Status & Diagnose
// ---------------------------------------------------------------------------
function updateGpsPill() {
  const p = $('#gpsPill');
  p.className = 'pill';
  if (S.src === 'demo') {
    p.textContent = demoPaused ? 'Test: Regler' : 'Testfahrt';
    p.classList.add('warn');
    return;
  }
  const age = performance.now() / 1000 - gps.lastFixAt;
  if (gps.status === 'aktiv' && age < 4) {
    p.textContent = `GPS ±${Math.round(gps.accuracy || 0)} m`;
    p.classList.add('ok');
  } else if (gps.status === 'verweigert' || gps.status === 'nicht verfügbar') {
    p.textContent = `GPS ${gps.status}`;
    p.classList.add('bad');
  } else if (gps.status === 'aus') {
    p.textContent = 'GPS aus';
  } else {
    p.textContent = gps.status === 'aktiv' ? 'GPS: warte…' : `GPS ${gps.status}`;
    p.classList.add('warn');
  }
}
gps.onUpdate = () => {
  updateGpsPill();
  if (gps.status === 'verweigert') toast('Standortzugriff verweigert. Bitte in den Browser-Einstellungen erlauben oder „Testfahrt“ nutzen.', 7000);
};
setInterval(() => {
  updateGpsPill();
  if (!$('#settings').hidden) {
    $('#diag').textContent =
      `Quelle: ${S.src === 'gps' ? 'GPS' : 'Testfahrt'}\n` +
      `Tempo: ${(lastState.v * 3.6).toFixed(1)} km/h  Beschl.: ${lastState.a.toFixed(2)} m/s²\n` +
      `Drehzahl: ${Math.round(lastState.rpm)}  Gang: ${lastState.gear}  Last: ${lastState.load.toFixed(2)}\n` +
      `GPS-Messungen: ${gps.fixes}  Intervall: ${gps.fixInterval.toFixed(2)} s  Genauigkeit: ${gps.accuracy ? gps.accuracy.toFixed(0) + ' m' : '–'}\n` +
      `Audio: ${audio.ctx ? audio.ctx.state + ' @ ' + audio.ctx.sampleRate + ' Hz' : 'nicht gestartet'}` +
      (gps.error ? `\nGPS-Fehler: ${gps.error}` : '');
  }
}, 500);

// ---------------------------------------------------------------------------
// Bedienelemente
// ---------------------------------------------------------------------------
function setSrc(src) {
  S.src = src;
  save();
  document.querySelectorAll('#srcSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.src === src)));
  if (src === 'gps' && running) gps.start();
  if (src === 'demo') { demo.v = 0; }
  updateGpsPill();
}
document.querySelectorAll('#srcSeg button').forEach((b) => b.addEventListener('click', () => setSrc(b.dataset.src)));

$('#startBtn').addEventListener('click', toggleEngine);

const gas = $('#gasBtn');
const gasDown = (e) => { e.preventDefault(); pedalHeld = true; gas.classList.add('down'); };
const gasUp = () => { pedalHeld = false; gas.classList.remove('down'); };
gas.addEventListener('pointerdown', gasDown);
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => gas.addEventListener(ev, gasUp));
gas.addEventListener('contextmenu', (e) => e.preventDefault());

function updatePaddles() {
  $('#upBtn').disabled = !S.manual;
  $('#downBtn').disabled = !S.manual;
}
$('#upBtn').addEventListener('click', () => drive.paddle(+1));
$('#downBtn').addEventListener('click', () => drive.paddle(-1));

const vol = $('#vol');
vol.value = S.volume;
vol.addEventListener('input', () => { S.volume = Number(vol.value); audio.setVolume(S.volume); save(); });

function bindRange(id, key, fmt, after) {
  const el = $('#' + id);
  const out = $('#' + id + 'Val');
  el.value = S[key];
  const show = () => out && (out.textContent = fmt(S[key]));
  show();
  el.addEventListener('input', () => {
    S[key] = Number(el.value);
    show();
    save();
    after && after();
  });
}
const pct = (x) => Math.round(x * 100) + ' %';
const db = (x) => (x > 0 ? '+' : '') + x + ' dB';
bindRange('aggr', 'aggr', (x) => (x < 0.33 ? 'gemütlich' : x < 0.7 ? 'sportlich' : 'Rennstrecke'), () => (drive.aggr = S.aggr));
bindRange('pops', 'pops', pct, pushSettings);
bindRange('bass', 'bass', db, pushSettings);
bindRange('treble', 'treble', db, pushSettings);

function bindCheck(id, key, after) {
  const el = $('#' + id);
  el.checked = !!S[key];
  el.addEventListener('change', () => { S[key] = el.checked; save(); after && after(); });
}
bindCheck('valve', 'valve', pushSettings);
bindCheck('manual', 'manual', () => { drive.manual = S.manual; updatePaddles(); });
bindCheck('mph', 'mph');

$('#demoPause').addEventListener('click', () => {
  demoPaused = !demoPaused;
  $('#demoPause').textContent = demoPaused ? 'Testfahrt fortsetzen' : 'Testfahrt pausieren';
  if (demoPaused) $('#testSpeed').value = Math.round(lastState.v * 3.6);
  else { demo.v = lastState.v; }
  updateGpsPill();
});

function openSheet(id) { $(id).hidden = false; }
$('#settingsBtn').addEventListener('click', () => openSheet('#settings'));
$('#helpBtn').addEventListener('click', () => openSheet('#help'));
document.querySelectorAll('.sheet').forEach((sh) => {
  sh.addEventListener('click', (e) => {
    if (e.target === sh || e.target.closest('[data-close]')) sh.hidden = true;
  });
});

// Tastatur (am PC zum Testen): Leertaste = Gas, Pfeile = Schalten
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { pedalHeld = true; e.preventDefault(); }
  if (e.code === 'ArrowUp') drive.paddle(+1);
  if (e.code === 'ArrowDown') drive.paddle(-1);
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') pedalHeld = false; });

// ---------------------------------------------------------------------------
window.__motorklang = { audio, drive, gps };

(async function boot() {
  applyAccent();
  setSrc(S.src);
  updatePaddles();
  renderCars();
  await discoverPacks();
  current = vehicles.find((v) => v.id === S.carId) || current;
  drive.setCar(current);
  applyAccent();
  renderCars();
  if (!localStorage.getItem(STORE + '.seen')) {
    openSheet('#help');
    try { localStorage.setItem(STORE + '.seen', '1'); } catch (e) { /* egal */ }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
