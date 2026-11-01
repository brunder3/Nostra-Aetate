// Offline-Render der Motor-Synthese in Node (zum Testen / Hörproben erzeugen).
//   node tools/render.mjs <carId|all> [sekunden] [ausgabeordner]
// Erzeugt WAV-Dateien mit der simulierten Testfahrt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARS } from '../js/cars.js';
import { Drivetrain } from '../js/drivetrain.js';
import { DemoDrive } from '../js/gps.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;

// --- Mini-Shim für die AudioWorklet-Umgebung ---
let Proc = null;
globalThis.sampleRate = SR;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null, postMessage() {} }; } };
globalThis.registerProcessor = (_n, cls) => { Proc = cls; };
const src = fs.readFileSync(path.join(here, '../js/engine-worklet.js'), 'utf8');
new Function(src)();

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

export function render(car, seconds, opts = {}) {
  const p = new Proc();
  const send = (d) => p.msg(d);
  send({ t: 'cfg', car: car.engine });
  send({ t: 'set', pops: 0.7, valve: true, bass: 4, treble: 0, persp: opts.persp || 'cabin' });
  send({ t: 'run', on: true });
  const dtr = new Drivetrain(car);
  dtr.aggr = opts.aggr ?? 0.6;
  const demo = new DemoDrive();
  const N = Math.round(seconds * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const block = 128;
  const ctrlEvery = Math.round(SR / 60 / block) || 1; // ~60 Hz Steuerrate
  let bi = 0;
  const log = [];
  for (let off = 0; off < N; off += block) {
    if (bi % ctrlEvery === 0) {
      const dt = (ctrlEvery * block) / SR;
      const s = opts.fixed ? opts.fixed(off / SR) : demo.sample(dt);
      const st = opts.fixedRpm ? { rpm: s.rpm, load: s.load, gear: 0 } : dtr.update(dt, s.v, s.a, s.pedal || 0);
      for (const ev of dtr.takeEvents()) send({ t: ev.type, ms: ev.ms });
      send({ t: 'st', rpm: st.rpm, load: st.load });
      if (bi % (ctrlEvery * 30) === 0) log.push(`${(off / SR).toFixed(1)}s v=${(s.v * 3.6 || 0).toFixed(0)} rpm=${st.rpm.toFixed(0)} g=${st.gear} load=${st.load.toFixed(2)}`);
    }
    bi++;
    const l = new Float32Array(block), r = new Float32Array(block);
    p.process([], [[l, r]]);
    const m = Math.min(block, N - off);
    L.set(l.subarray(0, m), off); R.set(r.subarray(0, m), off);
  }
  return { L, R, log };
}

export function rms(a, from = 0, to = a.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const which = process.argv[2] || 'all';
  const secs = Number(process.argv[3] || 30);
  const outDir = process.argv[4] || '.';
  fs.mkdirSync(outDir, { recursive: true });
  const list = which === 'all' ? CARS : CARS.filter((c) => c.id === which);
  for (const car of list) {
    const t0 = Date.now();
    const { L, R, log } = render(car, secs);
    let peak = 0, nan = 0;
    for (let i = 0; i < L.length; i++) { if (Number.isNaN(L[i])) nan++; peak = Math.max(peak, Math.abs(L[i])); }
    const f = path.join(outDir, `${car.id}.wav`);
    writeWav(f, L, R);
    console.log(`${car.id}: rms=${rms(L).toFixed(3)} peak=${peak.toFixed(3)} nan=${nan} ${(Date.now() - t0)}ms -> ${f}`);
    if (process.env.LOG) console.log(log.join('\n'));
  }
}
