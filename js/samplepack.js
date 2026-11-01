// Abspielen echter Motoraufnahmen ("Sound-Packs").
//
// Ein Pack besteht aus mehreren kurzen Aufnahmen bei konstanter Drehzahl
// (je unter Last = "on" und optional im Schub = "off"). Beim Fahren werden die
// zwei Aufnahmen, die der aktuellen Drehzahl am nächsten liegen, in der Tonhöhe
// angepasst und überblendet – so arbeiten auch Rennspiele.
// Die Loops müssen NICHT vorher nahtlos geschnitten sein: beim Laden wird das
// Ende automatisch in den Anfang überblendet.

function makeLoopable(ctx, buf, xfadeSec = 0.06) {
  const xf = Math.min(Math.floor(buf.length / 4), Math.floor(xfadeSec * buf.sampleRate));
  if (xf < 8) return buf;
  const len = buf.length - xf;
  const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, len));
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      // gleiche Leistung beim Überblenden
      const gIn = Math.sin((t * Math.PI) / 2);
      const gOut = Math.cos((t * Math.PI) / 2);
      dst[i] = src[i] * gIn + src[len + i] * gOut;
    }
  }
  return out;
}

export class SamplePackEngine {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.layers = [];
    this.loaded = false;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(output);
    this.offFilter = null;
  }

  async load(baseUrl, pack, onProgress) {
    const ctx = this.ctx;
    const files = [];
    pack.loops.forEach((l) => {
      files.push(l.on);
      if (l.off) files.push(l.off);
    });
    const cache = {};
    let done = 0;
    await Promise.all(
      files.map(async (f) => {
        const res = await fetch(baseUrl + f);
        if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        cache[f] = makeLoopable(ctx, buf);
        done++;
        onProgress && onProgress(done / files.length);
      })
    );
    const loops = [...pack.loops].sort((a, b) => a.rpm - b.rpm);
    this.layers = loops.map((l) => {
      const mk = (file, extraFilter) => {
        if (!file) return null;
        const src = ctx.createBufferSource();
        src.buffer = cache[file];
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        if (extraFilter) {
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 900;
          src.connect(f).connect(g);
        } else {
          src.connect(g);
        }
        g.connect(this.master);
        // zufälliger Startpunkt, damit die Loops nicht phasengleich laufen
        src.start(0, Math.random() * src.buffer.duration);
        return { src, g };
      };
      return {
        rpm: l.rpm,
        on: mk(l.on, false),
        // ohne eigene Schubaufnahme: Lastaufnahme gedämpft verwenden
        off: l.off ? mk(l.off, false) : mk(l.on, true),
      };
    });
    this.gain = pack.gain ?? 1;
    this.loaded = true;
  }

  setRunning(on) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? this.gain : 0, t, 0.08);
  }

  update(rpm, load) {
    if (!this.loaded || !this.layers.length) return;
    const t = this.ctx.currentTime;
    const L = this.layers;
    let i = 0;
    while (i < L.length - 1 && L[i + 1].rpm < rpm) i++;
    let j = Math.min(i + 1, L.length - 1);
    let x = 0;
    if (rpm <= L[0].rpm) { i = j = 0; }
    else if (i !== j) x = (rpm - L[i].rpm) / (L[j].rpm - L[i].rpm);
    x = Math.max(0, Math.min(1, x));
    const onMix = Math.max(0, Math.min(1, (load - 0.04) / 0.5));
    const tc = 0.03;
    L.forEach((layer, k) => {
      let w = 0;
      if (k === i) w = Math.cos((x * Math.PI) / 2);
      if (k === j) w = i === j ? 1 : Math.sin((x * Math.PI) / 2);
      const rate = Math.max(0.25, Math.min(4, rpm / layer.rpm));
      for (const [node, g] of [[layer.on, Math.sqrt(onMix) * (0.55 + 0.45 * load)], [layer.off, Math.sqrt(1 - onMix) * 0.6]]) {
        if (!node) continue;
        node.src.playbackRate.setTargetAtTime(rate, t, tc);
        node.g.gain.setTargetAtTime(w * g, t, tc);
      }
    });
  }

  dispose() {
    this.layers.forEach((l) => {
      [l.on, l.off].forEach((n) => {
        if (!n) return;
        try { n.src.stop(); } catch (e) { /* schon gestoppt */ }
        n.src.disconnect();
        n.g.disconnect();
      });
    });
    this.layers = [];
    this.master.disconnect();
    this.loaded = false;
  }
}
