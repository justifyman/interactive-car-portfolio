// Procedural Web Audio: no sound files to download or license.
// Engine hum (pitch follows speed), tyre skid, honk, bumps, UI clicks,
// and a soft generative ambience (wind, birds, music-box notes). Muted by default.

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private engineOsc: OscillatorNode[] = [];
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private skidGain!: GainNode;
  private noise!: AudioBuffer;
  private muted = true;
  private ambientTimer = 0;
  private musicTimer = 0;
  private speedSmoothed = 0;

  get ready() {
    return !!this.ctx;
  }

  private init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.35;
    // A soft feedback delay gives the ambience some space.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.38;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    this.musicBus.connect(this.master);
    this.musicBus.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.master);

    // Noise buffer shared by skid, wind and bumps.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish
      data[i] = white * 0.6 + last * 3;
    }

    // Engine: detuned saws through a low-pass, a toy-like putter.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineFilter.Q.value = 3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
    const types: OscillatorType[] = ['sawtooth', 'square', 'triangle'];
    [1, 0.5, 2.01].forEach((mul, i) => {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = 50 * mul;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.35, 0.12][i];
      o.connect(g).connect(this.engineFilter);
      o.start();
      this.engineOsc.push(o);
    });
    // Putter: amplitude LFO.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(this.engineGain.gain);
    lfo.start();

    // Skid: band-passed noise.
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = this.noise;
    skidSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.2;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc.connect(bp).connect(this.skidGain).connect(this.sfxBus);
    skidSrc.start();

    // Wind bed.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(lp).connect(wg).connect(this.musicBus);
    wind.start();

    this.scheduleAmbient();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!muted) this.init();
    if (!this.ctx) return;
    if (!muted && this.ctx.state === 'suspended') void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.8, t, 0.15);
  }

  private get live() {
    return this.ctx && !this.muted ? this.ctx : null;
  }

  engine(speed01: number, skidding: boolean) {
    const ctx = this.live;
    if (!ctx) return;
    this.speedSmoothed += (speed01 - this.speedSmoothed) * 0.1;
    const s = Math.min(1.3, this.speedSmoothed);
    const t = ctx.currentTime;
    const f = 48 + s * 95;
    this.engineOsc[0].frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engineOsc[2].frequency.setTargetAtTime(f * 2.01, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + s * 900, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + s * 0.06, t, 0.1);
    this.skidGain.gain.setTargetAtTime(skidding ? 0.09 : 0, t, skidding ? 0.03 : 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, bus: AudioNode = this.sfxBus, glideTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  horn(fancy = false, soft = false) {
    const ctx = this.live;
    if (!ctx) return;
    if (fancy) {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.06, i * 0.11));
      return;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    lp.connect(this.sfxBus);
    const g = soft ? 0.035 : 0.08;
    for (const when of soft ? [0] : [0, 0.2]) {
      this.tone(415, 0.16, 'square', g, when, lp);
      this.tone(523, 0.16, 'square', g * 0.8, when, lp);
    }
  }

  bump(strength: number) {
    const ctx = this.live;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260 + strength * 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * strength + 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(lp).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.2);
    this.tone(90, 0.16, 'sine', 0.3 * strength + 0.05, 0, this.sfxBus, 45);
  }

  /** Soft "tock" for knocking over props. */
  knock(strength: number) {
    if (!this.live) return;
    this.tone(220 + Math.random() * 120, 0.08, 'triangle', 0.05 + strength * 0.08, 0, this.sfxBus, 140);
  }

  click() {
    if (!this.live) return;
    this.tone(880, 0.06, 'sine', 0.06, 0, this.sfxBus, 660);
  }

  open() {
    if (!this.live) return;
    this.tone(523, 0.12, 'triangle', 0.06);
    this.tone(784, 0.18, 'triangle', 0.05, 0.07);
  }

  close() {
    if (!this.live) return;
    this.tone(659, 0.1, 'triangle', 0.05);
    this.tone(440, 0.14, 'triangle', 0.04, 0.06);
  }

  chime() {
    if (!this.live) return;
    [523, 659, 784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.07, i * 0.09, this.musicBus));
  }

  zone() {
    if (!this.live) return;
    this.tone(988, 0.12, 'sine', 0.04);
    this.tone(1319, 0.2, 'sine', 0.035, 0.06);
  }

  private bird() {
    const ctx = this.live;
    if (!ctx) return;
    const base = 2200 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), 0.07, 'sine', 0.018, i * 0.11, this.musicBus, base * 1.35);
  }

  private scheduleAmbient() {
    const PENTA = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
    const tick = () => {
      if (this.live) {
        if (Math.random() < 0.5) this.bird();
      }
      this.ambientTimer = window.setTimeout(tick, 2500 + Math.random() * 5000);
    };
    const music = () => {
      if (this.live) {
        const f = PENTA[Math.floor(Math.random() * PENTA.length)];
        this.tone(f, 1.6, 'sine', 0.035, 0, this.musicBus);
        if (Math.random() < 0.3) this.tone(f * 1.5, 1.4, 'sine', 0.02, 0.2, this.musicBus);
      }
      this.musicTimer = window.setTimeout(music, 700 + Math.random() * 1500);
    };
    clearTimeout(this.ambientTimer);
    clearTimeout(this.musicTimer);
    tick();
    music();
  }
}

export const sfx = new Sfx();
