// AudioWorklet: physikalisch inspirierte Verbrennungsmotor-Synthese.
//
// Signalfluss pro Auspuffbank:
//   Verbrennungsimpulse (Zündfolge, Krümmerlaufzeit, Last, Zyklusschwankung)
//   -> Sammler (kurzer Rohr-Wellenleiter)
//   -> Hauptrohr (langer Rohr-Wellenleiter mit Dämpfung = Rohrresonanzen)
//   -> Schalldämpfer (Tiefpass + Helmholtz-Resonanz, Klappe offen/zu)
//   -> Mündungsabstrahlung (Hochpass-Anteil = "Rotzigkeit")
// Dazu: Ansauggeräusch, Mechanik, Turbo-Pfeifen, Blow-Off, Kompressor-Heulen,
// Schubabschaltungs-Knallen (Pops & Bangs), Drehzahlbegrenzer, Zündunterbrechung.

const TAU = Math.PI * 2;

let seed = 0x9e3779b9 | 0;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
function white() {
  return rnd() * 2 - 1;
}
function gauss() {
  const u = rnd() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
}
function softclip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  _norm(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  _w(f, sr) {
    const w = (TAU * Math.min(f, sr * 0.45)) / sr;
    return [Math.cos(w), Math.sin(w)];
  }
  lp(f, q, sr) {
    const [c, s] = this._w(f, sr); const al = s / (2 * q);
    this._norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al); return this;
  }
  hp(f, q, sr) {
    const [c, s] = this._w(f, sr); const al = s / (2 * q);
    this._norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al); return this;
  }
  bp(f, q, sr) {
    const [c, s] = this._w(f, sr); const al = s / (2 * q);
    this._norm(al, 0, -al, 1 + al, -2 * c, 1 - al); return this;
  }
  peak(f, q, db, sr) {
    const [c, s] = this._w(f, sr); const al = s / (2 * q); const A = Math.pow(10, db / 40);
    this._norm(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A); return this;
  }
  lowshelf(f, db, sr) {
    const [c, s] = this._w(f, sr); const A = Math.pow(10, db / 40);
    const al = (s / 2) * Math.SQRT2; const sa = 2 * Math.sqrt(A) * al;
    this._norm(
      A * (A + 1 - (A - 1) * c + sa), 2 * A * (A - 1 - (A + 1) * c), A * (A + 1 - (A - 1) * c - sa),
      A + 1 + (A - 1) * c + sa, -2 * (A - 1 + (A + 1) * c), A + 1 + (A - 1) * c - sa);
    return this;
  }
  highshelf(f, db, sr) {
    const [c, s] = this._w(f, sr); const A = Math.pow(10, db / 40);
    const al = (s / 2) * Math.SQRT2; const sa = 2 * Math.sqrt(A) * al;
    this._norm(
      A * (A + 1 + (A - 1) * c + sa), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - sa),
      A + 1 - (A - 1) * c + sa, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - sa);
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() { this.z1 = this.z2 = 0; }
}

class Delay {
  constructor(n) {
    let size = 1;
    while (size < n + 4) size <<= 1;
    this.buf = new Float32Array(size);
    this.mask = size - 1;
    this.w = 0;
  }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
  read(d) {
    const pos = this.w - d;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    return this.buf[i0 & this.mask] * (1 - f) + this.buf[(i0 + 1) & this.mask] * f;
  }
  clear() { this.buf.fill(0); }
}

// Rohr als Wellenleiter: offenes Ende reflektiert invertiert (negatives Feedback),
// Wandverluste/Abstrahlung als Tiefpass in der Rückkopplung.
class Pipe {
  constructor(maxSamples) {
    this.d = new Delay(maxSamples);
    this.len = 64; this.fb = -0.5; this.z = 0; this.a = 0.5;
  }
  set(lenSamples, fb, dampHz, sr) {
    this.len = Math.max(2, Math.min(lenSamples, this.d.mask - 4));
    this.fb = fb;
    this.a = Math.exp((-TAU * dampHz) / sr);
  }
  p(x) {
    const r = this.d.read(this.len);
    this.z = r * (1 - this.a) + this.z * this.a;
    const y = x + this.fb * this.z;
    this.d.write(y);
    return y;
  }
  clear() { this.d.clear(); this.z = 0; }
}

class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    const sr = this.sr;
    this.cfg = null;
    this.on = false;
    this.fade = 0;

    // Steuergrößen (Ziel / geglättet)
    this.tRpm = 800; this.rpm = 800;
    this.tLoad = 0; this.load = 0;
    this.lastMsgLoad = 0;
    this.kRpm = 1 - Math.exp(-1 / (0.012 * sr));
    this.kLoad = 1 - Math.exp(-1 / (0.035 * sr));

    // Einstellungen
    this.popsAmt = 0.6;
    this.valve = true;
    this.bassDb = 3;
    this.trebleDb = -2;

    // Zustände
    this.phase = 0;
    this.overrunT = 0;
    this.cutSamples = 0;
    this.boost = 0;
    this.bovEnv = 0; this.bovType = 'psh'; this.bovPh = 0;
    this.turboPh = 0; this.turboPh2 = 0;
    this.scPh = 0;
    this.wobPh = 0;
    this.lim = false;
    this.flap = 1; this.flapApplied = -1;
    this.inSw = 0;
    this.whPh = 0; this.whAmp = 0;

    const maxPipe = Math.ceil(0.04 * sr);
    this.col = [new Pipe(maxPipe), new Pipe(maxPipe)];
    this.main = [new Pipe(maxPipe), new Pipe(maxPipe)];
    this.mLP = [new Biquad(), new Biquad()];
    this.mLP2 = [new Biquad(), new Biquad()];
    this.mRes = [new Biquad(), new Biquad()];
    this.nBP = [new Biquad(), new Biquad()];
    this.prevM = [0, 0];
    this.popDelay = [0, 0]; this.popAmp = [0, 0]; this.popEnv = [0, 0]; this.popDecay = 0.99;
    this.popLP = [new Biquad(), new Biquad()];

    this.inN = new Biquad(); this.inH = new Biquad(); this.inH2 = new Biquad(); this.inLP = new Biquad();
    this.mechHP = new Biquad();
    this.tbBP = new Biquad(); this.bovBP = new Biquad(); this.bovBP2 = new Biquad();
    this.dcL = new Biquad(); this.dcR = new Biquad();
    this.bsL = new Biquad(); this.bsR = new Biquad();
    this.trL = new Biquad(); this.trR = new Biquad();

    this.port.onmessage = (e) => this.msg(e.data);
  }

  msg(d) {
    switch (d.t) {
      case 'cfg': this.setCar(d.car); break;
      case 'st':
        this.tRpm = d.rpm;
        if (d.load < 0.1 && this.lastMsgLoad > 0.35 && this.boost > 0.35 && this.cfg && this.cfg.turbo && this.cfg.turbo.bov) {
          this.bovEnv = Math.min(1, 0.4 + this.boost);
        }
        this.lastMsgLoad = d.load;
        this.tLoad = d.load;
        break;
      case 'set':
        if (d.pops !== undefined) this.popsAmt = d.pops;
        if (d.valve !== undefined) this.valve = d.valve;
        if (d.bass !== undefined) this.bassDb = d.bass;
        if (d.treble !== undefined) this.trebleDb = d.treble;
        this.updateFilters();
        break;
      case 'cut':
        this.cutSamples = Math.round((d.ms / 1000) * this.sr);
        break;
      case 'run':
        this.on = !!d.on;
        break;
    }
  }

  setCar(c) {
    const sr = this.sr;
    this.cfg = c;
    const n = c.cyl;
    this.n = n;
    this.cycle = c.cycle || 720;
    this.fire = Float64Array.from(c.fire);
    this.bankOf = Int8Array.from(c.bank);
    this.hdr = Int32Array.from(c.header.map((ms) => Math.round((ms / 1000) * sr)));
    this.pDelay = new Int32Array(n);
    this.pAge = new Float64Array(n);
    this.pAmp = new Float32Array(n);
    this.pW = new Float32Array(n);
    this.pOn = new Uint8Array(n);
    this.iAge = new Float64Array(n);
    this.iAmp = new Float32Array(n);
    this.iOn = new Uint8Array(n);
    this.tick = new Float32Array(n);
    // feste Zylinder-Individualität (leicht ungleiche Füllung)
    this.cylVar = new Float32Array(n);
    for (let i = 0; i < n; i++) this.cylVar[i] = 1 + (rnd() - 0.5) * 2 * (c.lope || 0);

    const p = c.pipe;
    for (let b = 0; b < 2; b++) {
      const k = b === 0 ? 1 : 1.037; // leicht unterschiedliche Rohrlängen links/rechts
      this.col[b].set((p.colMs / 1000) * sr * k, p.colFb, p.damp * 1.6, sr);
      this.main[b].set((p.mainMs / 1000) * sr * k, p.mainFb, p.damp, sr);
      this.col[b].clear(); this.main[b].clear();
      this.nBP[b].bp(2200, 0.7, sr);
      this.popLP[b].lp(3500, 0.7, sr);
      this.mRes[b].peak(c.muffler.resHz * (b ? 1.05 : 1), c.muffler.q, c.muffler.resDb, sr);
    }
    this.inN.bp(c.intake.hz, c.intake.q, sr);
    this.inH.bp(c.intake.helm, 2.5, sr);
    this.inH2.bp(c.intake.helm2 || c.intake.helm, 2.5, sr);
    this.inLP.lp(4000, 0.7, sr);
    this.mechHP.hp(2600, 0.7, sr);
    this.tbBP.bp(3200, 0.9, sr);
    this.bovBP.bp(2600, 0.8, sr);
    this.bovBP2.bp(900, 1.2, sr);
    this.dcL.hp(22, 0.7, sr); this.dcR.hp(22, 0.7, sr);
    this.popDecay = Math.exp(-1 / (0.007 * sr));
    this.boost = 0; this.bovEnv = 0;
    this.rpm = this.tRpm = c.idle;
    this.phase = 0;
    this.pOn.fill(0); this.iOn.fill(0);
    this.flapApplied = -1;
    this.updateFilters();
  }

  updateFilters() {
    const c = this.cfg; if (!c) return;
    const sr = this.sr;
    this.applyFlap(this.flap);
    this.bsL.lowshelf(110, this.bassDb, sr); this.bsR.lowshelf(110, this.bassDb, sr);
    this.trL.highshelf(3500, this.trebleDb, sr); this.trR.highshelf(3500, this.trebleDb, sr);
  }

  // Auspuffklappe: 0 = zu, 1 = offen (stufenlos, damit es nicht knackt)
  applyFlap(pos) {
    const c = this.cfg; const sr = this.sr;
    const turboDamp = c.turbo ? 1 - 0.25 * c.turbo.level : 1;
    const fc = (c.muffler.cutoff + (c.muffler.valveCutoff - c.muffler.cutoff) * pos) * turboDamp;
    for (let b = 0; b < 2; b++) {
      this.mLP[b].lp(fc, 0.6, sr);
      this.mLP2[b].lp(fc * 1.6, 0.6, sr);
    }
    this.exLevel = 0.62 + 0.38 * pos;
    this.flapApplied = pos;
  }

  fireCyl(i, rpmN, idleF, overrun) {
    const c = this.cfg;
    let a;
    let cut = this.cutSamples > 0;
    if (this.lim && rnd() < 0.75) cut = true;
    if (cut) a = 0.035;
    else if (overrun) {
      if (c.overrunMode === 'blown' && this.rpm > c.idle * 1.3) {
        // "Angeblasener Diffusor" (F1 2010/11): Motor zündet im Schub mit spätem
        // Zündzeitpunkt weiter -> raues, knatterndes Schubgeräusch
        a = rnd() < 0.3 ? 0.04 : 0.3 + 0.28 * rnd();
      } else a = 0.13 + 0.05 * rnd();
    }
    else a = 0.3 + 0.7 * Math.pow(this.load, 0.85);
    a *= 0.7 + 0.45 * rpmN;
    const rough = c.rough * (1 + 2.5 * idleF);
    a *= Math.max(0.2, 1 + rough * gauss());
    a *= 1 + (this.cylVar[i] - 1) * (0.35 + 0.65 * idleF);
    if (a < 0) a = 0;
    this.pDelay[i] = this.hdr[i];
    this.pAge[i] = 0;
    this.pAmp[i] = a;
    this.pW[i] = c.pulseW * (overrun || cut ? (c.overrunMode === 'blown' ? 1.5 : 1.35) : 1.15 - 0.35 * this.load);
    this.pOn[i] = 1;
    // Ansaugimpuls
    this.iAge[i] = 0;
    this.iAmp[i] = cut || overrun ? 0.05 : 0.15 + 0.85 * this.load;
    this.iOn[i] = 1;
    this.tick[i] = 1;

    // Nachverbrennung (Pops & Bangs) bei Schub oder Zündunterbrechung
    const popBase = c.pops * this.popsAmt;
    if (popBase > 0 && (overrun || cut) && this.rpm > c.idle * 1.8) {
      let pr = 0.022 * popBase * (0.4 + rpmN);
      if (overrun) pr *= 0.25 + 0.75 * Math.exp(-this.overrunT / 1.6);
      if (this.cutSamples > 0) pr *= 5;
      if (this.lim) pr *= 1.5;
      if (rnd() < pr) {
        const b = this.bankOf[i];
        if (this.popEnv[b] < 0.1 && this.popDelay[b] <= 0) {
          this.popDelay[b] = 1 + Math.floor(rnd() * 0.035 * this.sr);
          this.popAmp[b] = (0.5 + rnd() * 0.9) * (0.6 + 0.4 * popBase);
        }
      }
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const N = L.length;
    const c = this.cfg;
    if (!c) { L.fill(0); if (R !== L) R.fill(0); return true; }

    const sr = this.sr;
    const dt = N / sr;
    const rpmN0 = this.rpm / c.redline;

    // Blockweise Zustände: Turbo-Ladedruck, Schubphase, Begrenzer
    if (c.turbo) {
      const spool = Math.min(1, Math.max(0, (this.rpm - c.turbo.spool * 0.55) / (c.turbo.spool * 0.9)));
      const target = Math.pow(this.load, 1.3) * spool;
      const tau = target > this.boost ? 0.55 : c.turbo.hold || 0.2;
      this.boost += (target - this.boost) * Math.min(1, dt / tau);
    }
    const overrun = this.load < 0.035 && this.tLoad < 0.05;
    this.overrunT = overrun ? this.overrunT + dt : 0;
    this.lim = this.rpm >= c.limiter * 0.993;
    const fadeTarget = this.on ? 1 : 0;

    // Klappe: "offen" = immer offen, sonst automatisch bei Last / hoher Drehzahl
    const flapT = this.valve ? 1 : (this.load > 0.5 && rpmN0 > 0.4) || rpmN0 > 0.68 ? 1 : 0;
    this.flap += (flapT - this.flap) * Math.min(1, dt / 0.25);
    if (Math.abs(this.flap - this.flapApplied) > 0.02) this.applyFlap(this.flap);

    // Schaltsaugrohr (z. B. GT3): ab einer Drehzahl andere Resonanz + mehr Ansauggeräusch
    const swRpm = c.intake.switchRpm || 0;
    if (swRpm) {
      const x = Math.min(1, Math.max(0, (this.rpm - swRpm) / 600 + 0.5));
      this.inSw = x * x * (3 - 2 * x);
    } else this.inSw = 0;
    const inSw = this.inSw;
    const inMul = 1 + ((c.intake.level2 || 1) - 1) * inSw;
    const wh = c.whine;
    const inNoise = 1.8 * (c.intake.noise ?? 1);

    const n = this.n;
    const cyc = this.cycle;
    const noiseAmt = c.noise;
    const rasp = c.rasp;
    const cross = c.cross;
    const xn = 1 / (1 + cross);
    const inLvl = c.intake.level;
    const mechLvl = c.mech;
    const single = !!c.single;
    const tb = c.turbo;
    const sc = c.supercharger;
    const gain = 0.55 * (c.gain || 1);
    const lope = c.lope || 0;
    const fadeK = 1 - Math.exp(-1 / (0.08 * sr));

    for (let s = 0; s < N; s++) {
      this.rpm += (this.tRpm - this.rpm) * this.kRpm;
      this.load += (this.tLoad - this.load) * this.kLoad;
      this.fade += (fadeTarget - this.fade) * fadeK;

      const idleF = Math.max(0, 1 - (this.rpm - c.idle) / 1400);
      // leichtes Leerlauf-Schwanken (Nockenwelle / Lope)
      this.wobPh += 0.9 / sr;
      if (this.wobPh > 1) this.wobPh -= 1;
      const wob = 1 + idleF * (0.012 + lope * 0.05 + (c.wobble || 0)) * Math.sin(TAU * this.wobPh);
      const rpm = this.rpm * wob;
      const rpmN = rpm / c.redline;
      const dps = (6 * rpm) / sr; // Kurbelwellengrad pro Sample

      // Zündzeitpunkte prüfen
      const prev = this.phase;
      let ph = prev + dps;
      let wrapped = false;
      if (ph >= cyc) { ph -= cyc; wrapped = true; }
      this.phase = ph;
      for (let i = 0; i < n; i++) {
        const a = this.fire[i];
        if (wrapped ? (prev < a || ph >= a) : (prev < a && ph >= a)) this.fireCyl(i, rpmN, idleF, overrun);
      }
      if (this.cutSamples > 0) this.cutSamples--;

      // Impulse in die Bänke summieren
      let t0 = 0, t1 = 0, n0 = 0, n1 = 0, inT = 0, inNz = 0, mech = 0;
      const wn = white();
      const wn2 = white();
      for (let i = 0; i < n; i++) {
        if (this.pOn[i]) {
          if (this.pDelay[i] > 0) {
            this.pDelay[i]--;
          } else {
            this.pAge[i] += dps;
            const x = this.pAge[i] / this.pW[i];
            if (x > 7) {
              this.pOn[i] = 0;
            } else {
              const v = this.pAmp[i] * x * Math.exp(1 - x);
              if (this.bankOf[i] === 0) { t0 += v; n0 += v * wn; } else { t1 += v; n1 += v * wn2; }
            }
          }
        }
        if (this.iOn[i]) {
          this.iAge[i] += dps;
          const x = this.iAge[i] / (this.pW[i] * 2.6);
          if (x > 6) this.iOn[i] = 0;
          else {
            const v = this.iAmp[i] * x * Math.exp(1 - x);
            inT += v; inNz += v * wn2;
          }
        }
        if (this.tick[i] > 0.001) {
          mech += this.tick[i] * wn;
          this.tick[i] *= 0.82;
        }
      }
      if (single) { t1 = t0; n1 = n0; }

      // Pops
      let pop0 = 0, pop1 = 0;
      for (let b = 0; b < 2; b++) {
        if (this.popDelay[b] > 0) {
          this.popDelay[b]--;
          if (this.popDelay[b] === 0) this.popEnv[b] = this.popAmp[b];
        }
        if (this.popEnv[b] > 0.0005) {
          const e = this.popEnv[b];
          const v = this.popLP[b].p(e * (0.9 * white() + 0.7));
          if (b === 0) pop0 = v; else pop1 = v;
          this.popEnv[b] = e * this.popDecay;
        }
      }
      if (single) { pop0 += pop1; pop1 = pop0; }

      // Auspuffstränge
      let ex0, ex1;
      {
        const x = t0 + noiseAmt * 2.2 * this.nBP[0].p(n0) + pop0 * 1.6;
        let y = this.main[0].p(this.col[0].p(x));
        y = this.mRes[0].p(this.mLP2[0].p(this.mLP[0].p(y)));
        ex0 = y + rasp * (y - this.prevM[0]) * 2.5 + pop0 * 0.35;
        this.prevM[0] = y;
      }
      {
        const x = t1 + noiseAmt * 2.2 * this.nBP[1].p(n1) + pop1 * 1.6;
        let y = this.main[1].p(this.col[1].p(x));
        y = this.mRes[1].p(this.mLP2[1].p(this.mLP[1].p(y)));
        ex1 = y + rasp * (y - this.prevM[1]) * 2.5 + pop1 * 0.35;
        this.prevM[1] = y;
      }
      const exL = (ex0 + cross * ex1) * xn * this.exLevel;
      const exR = (ex1 + cross * ex0) * xn * this.exLevel;

      // Ansaugtrakt
      const inG = inLvl * inMul * (0.25 + 0.75 * this.load) * (0.35 + 0.65 * rpmN) * (tb ? 0.6 : 1);
      let helm = this.inH.p(inT);
      if (swRpm) helm = helm * (1 - inSw) + this.inH2.p(inT) * inSw;
      const intake = inG * this.inLP.p(helm * 1.4 + this.inN.p(inNz) * inNoise);

      // Mechanik (Ventiltrieb)
      const mechS = mechLvl * 0.25 * (0.3 + 0.7 * rpmN) * this.mechHP.p(mech);

      // Turbo / Kompressor
      let aux = 0;
      // Getriebe-/E-Maschinen-Heulen (geradverzahnte Rennsport-Getriebe, MGU-K)
      if (wh) {
        const target = wh.level * 0.03 * rpmN * (overrun ? wh.overrun ?? 1 : 0.35);
        this.whAmp += (target - this.whAmp) * 0.0005;
        this.whPh += ((rpm / 60) * wh.order) / sr;
        if (this.whPh > 1) this.whPh -= 1;
        aux += this.whAmp * (Math.sin(TAU * this.whPh) + 0.3 * Math.sin(2 * TAU * this.whPh));
      }
      if (tb) {
        const b = this.boost;
        const f = (tb.f0 + (tb.f1 - tb.f0) * b) * (0.75 + 0.25 * rpmN);
        this.turboPh += f / sr; if (this.turboPh > 1) this.turboPh -= 1;
        this.turboPh2 += (f * 1.013) / sr; if (this.turboPh2 > 1) this.turboPh2 -= 1;
        const whistle = (Math.sin(TAU * this.turboPh) + 0.6 * Math.sin(TAU * this.turboPh2)) * b * b * 0.022;
        const whoosh = this.tbBP.p(white()) * b * this.load * 0.06;
        aux += tb.level * (whistle + whoosh);
        if (this.bovEnv > 0.001) {
          let v;
          if (tb.bov === 'flutter') {
            this.bovPh += 19 / sr; if (this.bovPh > 1) this.bovPh -= 1;
            const gate = this.bovPh < 0.45 ? 1 : 0.15;
            v = this.bovBP2.p(white()) * gate * 0.5 + this.bovBP.p(white()) * 0.08;
            this.bovEnv *= Math.exp(-1 / (0.28 * sr));
          } else {
            v = this.bovBP.p(white()) * 0.45;
            this.bovEnv *= Math.exp(-1 / (0.22 * sr));
          }
          aux += v * this.bovEnv * tb.level;
        }
      }
      if (sc) {
        const f = (rpm / 60) * sc.ratio;
        this.scPh += f / sr; if (this.scPh > 1) this.scPh -= 1;
        const w = Math.sin(TAU * this.scPh) + 0.35 * Math.sin(2 * TAU * this.scPh);
        aux += sc.level * 0.05 * w * (0.25 + 0.75 * this.load) * (0.15 + 0.85 * rpmN);
      }

      let l = (exL + intake + mechS + aux) * gain;
      let r = (exR + intake + mechS + aux) * gain;
      l = this.trL.p(this.bsL.p(this.dcL.p(l)));
      r = this.trR.p(this.bsR.p(this.dcR.p(r)));
      L[s] = softclip(l * this.fade);
      R[s] = softclip(r * this.fade);
    }
    if (R === L) return true;
    return true;
  }
}

registerProcessor('engine-synth', EngineProcessor);
