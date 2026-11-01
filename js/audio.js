// Audio-Grundgerüst: AudioContext, Synth-Worklet, Sound-Packs, Lautstärke.
import { SamplePackEngine } from './samplepack.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.pack = null;
    this.synthGain = null;
    this.master = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(new URL('./engine-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(this.ctx, 'engine-synth', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.master = this.ctx.createGain();
    this.synthGain = this.ctx.createGain();
    // Sanfter Limiter gegen Übersteuern bei hoher Lautstärke
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -6;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.15;
    this.node.connect(this.synthGain).connect(this.master);
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.ready = true;
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  post(msg) {
    this.node && this.node.port.postMessage(msg);
  }

  setVolume(v) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(v * v * 1.6, this.ctx.currentTime, 0.05);
  }

  setSynthLevel(v) {
    if (!this.synthGain) return;
    this.synthGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  async loadPack(baseUrl, pack, onProgress) {
    this.unloadPack();
    const eng = new SamplePackEngine(this.ctx, this.master);
    await eng.load(baseUrl, pack, onProgress);
    this.pack = eng;
    return eng;
  }

  unloadPack() {
    if (this.pack) this.pack.dispose();
    this.pack = null;
  }
}
