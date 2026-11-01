// GPS-Geschwindigkeit mit Glättung und Vorhersage.
//
// Fahrzeug-GPS liefert typischerweise nur ~1 Messung pro Sekunde. Damit der Sound
// nicht "stufig" klingt, wird zwischen den Messungen mit der geschätzten
// Beschleunigung weitergerechnet (Dead Reckoning) und weich nachgeführt.

const R_EARTH = 6371000;
function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class GpsSpeed {
  constructor() {
    this.watchId = null;
    this.status = 'aus';
    this.error = null;
    this.accuracy = null;
    this.fixes = 0;
    this.last = null; // {t, v, lat, lon}
    this.vMeas = 0;
    this.aEst = 0;
    this.vOut = 0;
    this.aOut = 0;
    this.lastFixAt = 0;
    this.fixInterval = 1;
    this.onUpdate = null;
  }

  get supported() {
    return 'geolocation' in navigator;
  }

  start() {
    if (!this.supported) {
      this.status = 'nicht verfügbar';
      return;
    }
    if (this.watchId !== null) return;
    this.status = 'suche…';
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onFix(p),
      (err) => {
        this.error = err.message || String(err.code);
        this.status = err.code === 1 ? 'verweigert' : 'kein Signal';
        this.onUpdate && this.onUpdate();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.status = 'aus';
  }

  onFix(p) {
    const now = performance.now() / 1000;
    const c = p.coords;
    const cur = { t: now, lat: c.latitude, lon: c.longitude };
    let v = null;
    if (typeof c.speed === 'number' && !Number.isNaN(c.speed) && c.speed >= 0) {
      v = c.speed;
    } else if (this.last) {
      const dt = now - this.last.t;
      if (dt > 0.3) {
        const d = haversine(this.last, cur);
        // Positionsrauschen im Stand ignorieren
        v = d < Math.max(1.5, (c.accuracy || 10) * 0.25) ? 0 : d / dt;
      }
    }
    this.accuracy = c.accuracy;
    this.fixes++;
    this.status = 'aktiv';
    this.error = null;

    if (v !== null) {
      if (v < 0.5) v = 0;
      if (this.last && this.last.v !== undefined) {
        const dt = now - this.last.t;
        if (dt > 0.2 && dt < 5) {
          const aMeas = Math.max(-12, Math.min(12, (v - this.last.v) / dt));
          this.aEst = this.aEst * 0.35 + aMeas * 0.65;
          this.fixInterval = this.fixInterval * 0.8 + dt * 0.2;
        }
      }
      this.vMeas = v;
      cur.v = v;
    }
    this.last = cur;
    this.lastFixAt = now;
    this.onUpdate && this.onUpdate();
  }

  /** Liefert die geglättete, vorhergesagte Geschwindigkeit & Beschleunigung. */
  sample(dt) {
    const now = performance.now() / 1000;
    const age = now - this.lastFixAt;
    // Beschleunigung nach Ausbleiben von Messungen abklingen lassen
    const aDecay = age < this.fixInterval * 1.6 ? 1 : Math.exp(-(age - this.fixInterval * 1.6) / 0.8);
    const a = this.aEst * aDecay;
    // Vorhersage: letzte Messung + a * Zeit seit Messung (begrenzt)
    const horizon = Math.min(age, this.fixInterval * 1.5);
    let vPred = Math.max(0, this.vMeas + a * horizon);
    if (this.vMeas === 0 && a <= 0) vPred = 0;
    // Weich nachführen
    const k = Math.min(1, dt / 0.25);
    this.vOut += (vPred - this.vOut) * k;
    this.aOut += (a - this.aOut) * Math.min(1, dt / 0.3);
    if (this.vOut < 0.05) this.vOut = 0;
    return { v: this.vOut, a: this.aOut };
  }
}

// Simulierte Testfahrt (zum Ausprobieren ohne zu fahren)
export class DemoDrive {
  constructor() {
    this.t = 0;
    this.v = 0;
    this.a = 0;
    // [Dauer s, Zielbeschleunigung m/s²]
    this.script = [
      [3, 0], [5.5, 6.5], [2.5, 3.0], [4, 0], [3, -6], [2, 0],
      [6, 2.2], [4, 0.2], [3, -1.5], [3, 1.2], [4, -3.5], [1.5, 0],
      [7, 4.0], [2, -8], [3, -4], [3, 0],
    ];
    this.i = 0;
    this.segT = 0;
  }
  sample(dt) {
    const [dur, acc] = this.script[this.i];
    this.segT += dt;
    // Beschleunigung nimmt mit Tempo ab (Luftwiderstand, Traktion)
    let target = acc > 0 ? acc * Math.max(0.25, 1 - this.v / 75) : acc;
    if (this.v <= 0 && target < 0) target = 0;
    this.a += (target - this.a) * Math.min(1, dt * 3);
    this.v = Math.max(0, this.v + this.a * dt);
    if (this.v === 0 && this.a < 0) this.a = 0;
    if (this.segT >= dur) {
      this.segT = 0;
      this.i = (this.i + 1) % this.script.length;
      if (this.i === 0) this.v = 0;
    }
    return { v: this.v, a: this.a };
  }
}
