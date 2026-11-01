// Virtueller Antriebsstrang: rechnet Geschwindigkeit + Beschleunigung in
// Drehzahl, Gang und Motorlast um (inkl. Schaltlogik, Zwischengas, Anfahren).

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export class Drivetrain {
  constructor(car) {
    this.aggr = 0.6; // 0 = gemütlich, 1 = Rennstrecke
    this.manual = false;
    this.setCar(car);
  }

  setCar(car) {
    this.car = car;
    this.e = car.engine;
    this.g = car.gearbox;
    this.gear = 1;
    this.rpm = this.e.idle;
    this.load = 0;
    this.loadRaw = 0;
    this.shift = null; // {from, to, t, dur, up}
    this.events = [];
    this.lastShiftAt = -10;
    this.time = 0;
    this.pendingManual = 0;
  }

  ratio(g) {
    return this.g.ratios[g - 1] * this.g.final;
  }

  wheelRpm(v, g) {
    return (v / this.g.tire) * 60 * this.ratio(g);
  }

  /** Manueller Gangwechsel (Schaltwippen) */
  paddle(dir) {
    this.pendingManual += dir;
  }

  /**
   * @param {number} dt      Zeitschritt in s
   * @param {number} v       Geschwindigkeit in m/s
   * @param {number} a       Beschleunigung in m/s²
   * @param {number} pedal   zusätzlicher "Gas"-Knopf 0..1 (Standgas / Kickdown)
   */
  update(dt, v, a, pedal = 0) {
    this.time += dt;
    const e = this.e;
    const n = this.g.ratios.length;
    const aggr = this.aggr;

    // ---- Motorlast aus Fahrdynamik ----------------------------------------
    // Konstantfahrt braucht etwas Last (Roll- & Luftwiderstand), Beschleunigung viel,
    // Verzögerung = Schubabschaltung.
    const cruise = 0.1 + 0.32 * Math.min(1, (v / 45) ** 2);
    const accScale = lerp(3.2, 1.6, aggr); // m/s² für Volllast
    let target;
    if (a > 0.12) target = cruise + (a - 0.12) / accScale;
    else if (a < -0.35) target = 0;
    else if (a < -0.12) target = cruise * (1 - (-a - 0.12) / 0.23);
    else target = cruise;
    if (v < 0.4) target = 0;
    target = Math.max(target, pedal);
    target = clamp(target * lerp(0.85, 1.15, aggr), 0, 1);
    this.loadRaw = target;

    // ---- Gangwahl ------------------------------------------------------------
    if (!this.shift) {
      if (this.manual) {
        if (this.pendingManual !== 0) {
          const to = clamp(this.gear + Math.sign(this.pendingManual), 1, n);
          this.pendingManual = 0;
          if (to !== this.gear) this.startShift(to, v);
        } else if (this.gear > 1 && this.wheelRpm(v, this.gear) < e.idle * 1.05) {
          this.startShift(this.gear - 1, v); // Abwürgschutz
        }
      } else {
        this.pendingManual = 0;
        const loadF = clamp(this.loadRaw, 0, 1);
        const sport = clamp(0.25 * aggr + 0.75 * loadF * (0.5 + aggr), 0, 1);
        const upLow = Math.max(e.idle * 2.4, e.redline * 0.3);
        const upRpm = lerp(upLow, e.redline * 0.96, Math.pow(sport, 1.3));
        let downRpm = lerp(Math.max(e.idle * 1.35, e.redline * 0.14), e.redline * 0.5, sport);
        if (a < -1.2) downRpm = Math.max(downRpm, e.redline * lerp(0.3, 0.45, aggr)); // Bremsen: Zwischengas-Runterschalten
        const rpmNow = this.wheelRpm(v, this.gear);
        const since = this.time - this.lastShiftAt;
        if (this.gear < n && rpmNow > upRpm && since > 0.35 && a > -0.3) {
          this.startShift(this.gear + 1, v);
        } else if (this.gear > 1 && rpmNow < downRpm && since > 0.45) {
          const lower = this.wheelRpm(v, this.gear - 1);
          if (lower < e.redline * 0.9 && lower < upRpm * 0.98) this.startShift(this.gear - 1, v);
        } else if (v < 0.3) {
          this.gear = 1;
        }
      }
    }

    // ---- Drehzahl --------------------------------------------------------------
    let rpmTarget;
    let loadOut = target;
    if (this.shift) {
      const s = this.shift;
      s.t += dt;
      const k = clamp(s.t / s.dur, 0, 1);
      const from = this.wheelRpm(v, s.from);
      const to = this.wheelRpm(v, s.to);
      if (s.up) {
        rpmTarget = lerp(Math.max(from, e.idle), Math.max(to, e.idle), smooth(k));
        loadOut = k < 0.7 ? 0 : target; // Zündunterbrechung beim Hochschalten
      } else {
        // Zwischengas: kurz über Zieldrehzahl hinaus
        const blip = Math.max(to, e.idle) * (1 + 0.06 * Math.sin(Math.PI * k));
        rpmTarget = lerp(Math.max(from, e.idle), blip, smooth(Math.min(1, k * 1.6)));
        loadOut = k < 0.55 ? 0.55 + 0.3 * aggr : target;
      }
      if (k >= 1) {
        this.gear = s.to;
        this.shift = null;
      }
    } else {
      const wr = this.wheelRpm(v, this.gear);
      // Anfahren / Kupplung schleift im 1. Gang
      const slipRpm = e.idle + target * (e.redline * lerp(0.22, 0.42, aggr) - e.idle);
      if (this.gear === 1 && wr < slipRpm && v < 12) {
        const blend = clamp(v / 12, 0, 1);
        rpmTarget = lerp(Math.max(slipRpm, wr), Math.max(wr, e.idle), blend * blend);
      } else {
        rpmTarget = Math.max(wr, e.idle);
      }
      // Im Stand: Gasstoß-Knopf dreht frei hoch
      if (v < 0.4) {
        rpmTarget = e.idle + Math.pow(pedal, 1.2) * (e.limiter * 1.02 - e.idle);
        loadOut = pedal > 0.02 ? pedal : 0.06;
      }
    }

    // Drehzahlbegrenzer
    if (rpmTarget > e.limiter) rpmTarget = e.limiter + (Math.random() - 0.5) * e.limiter * 0.012;

    // Motor-Trägheit: hochdrehen schneller als abfallen (im Stand)
    const free = v < 0.4 && !this.shift;
    const up = rpmTarget > this.rpm;
    const rate = this.shift ? 30 : free ? (up ? 7 : 3.2) : 14;
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * rate);
    this.rpm = clamp(this.rpm, e.idle * 0.85, e.limiter * 1.01);

    // Last glätten (aber schnelles Gaswegnehmen erlauben)
    const lk = loadOut < this.load ? 14 : 7;
    this.load += (loadOut - this.load) * Math.min(1, dt * lk);

    return {
      rpm: this.rpm,
      load: this.load,
      gear: this.gear,
      shifting: !!this.shift,
    };
  }

  startShift(to, v) {
    const up = to > this.gear;
    const dur = this.g.shift * (up ? 1 : 1.5) * (this.manual ? 1 : lerp(1.4, 0.8, this.aggr));
    this.shift = { from: this.gear, to, t: 0, dur, up };
    this.lastShiftAt = this.time;
    // Ignition-Cut-"Furz" nur bei sportlichem Hochschalten unter Last
    if (up && this.load > 0.45) this.events.push({ type: 'cut', ms: dur * 1000 * 0.75 });
  }

  takeEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
