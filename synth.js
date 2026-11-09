'use strict';

/* ------------------------------------------------------------------
   Sound presets.
   oscs:   ratio = frequency multiple of the note, detune in cents, pan -1..1
   filter: freq at middle C, kt = key tracking (0 = fixed, 1 = follows pitch),
           env = how far (Hz) the filter envelope opens it
   amp:    attack / decay / sustain / release (seconds, sustain 0..1)
   lfo:    target 'filter' (depth Hz) or 'pitch' (depth cents)
------------------------------------------------------------------- */
const PRESETS = [
  {
    id: 'glass', name: 'Glass Pad', cat: 'Pad', level: 0.2,
    oscs: [
      { type: 'sine', ratio: 1, detune: -7, gain: 0.5, pan: -0.5 },
      { type: 'triangle', ratio: 1, detune: 7, gain: 0.45, pan: 0.5 },
      { type: 'sine', ratio: 2, detune: 3, gain: 0.18, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 1600, q: 1, kt: 0.4, env: 1800, a: 2.2, d: 3, s: 0.35 },
    amp: { a: 1.6, d: 2, s: 0.85, r: 4 },
    lfo: { target: 'filter', rate: 0.15, depth: 400 },
  },
  {
    id: 'strings', name: 'String Machine', cat: 'Pad', level: 0.15,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -12, gain: 0.34, pan: -0.7 },
      { type: 'sawtooth', ratio: 1, detune: 0, gain: 0.34, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: 12, gain: 0.34, pan: 0.7 },
    ],
    filter: { type: 'lowpass', freq: 2600, q: 0.7, kt: 0.5, env: 0, a: 0.1, d: 1, s: 1 },
    amp: { a: 0.8, d: 1, s: 0.9, r: 2.5 },
    lfo: { target: 'pitch', rate: 5.2, depth: 5 },
  },
  {
    id: 'choir', name: 'Choir', cat: 'Pad', level: 0.2,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -6, gain: 0.4, pan: -0.4 },
      { type: 'sawtooth', ratio: 1, detune: 6, gain: 0.4, pan: 0.4 },
      { type: 'triangle', ratio: 0.5, detune: 0, gain: 0.25, pan: 0 },
    ],
    noise: 0.03,
    filter: { type: 'lowpass', freq: 900, q: 5, kt: 0.3, env: 300, a: 1.5, d: 2, s: 0.5 },
    amp: { a: 1.2, d: 1.5, s: 0.9, r: 3 },
    lfo: { target: 'filter', rate: 0.3, depth: 220 },
  },
  {
    id: 'sweep', name: 'Sweep Pad', cat: 'Pad', level: 0.17,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -5, gain: 0.45, pan: -0.6 },
      { type: 'square', ratio: 1, detune: 5, gain: 0.3, pan: 0.6 },
      { type: 'sawtooth', ratio: 0.5, detune: 0, gain: 0.25, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 260, q: 7, kt: 0.2, env: 3200, a: 6, d: 6, s: 0.35 },
    amp: { a: 2.5, d: 2, s: 1, r: 5 },
    lfo: { target: 'filter', rate: 0.07, depth: 300 },
  },
  {
    id: 'wind', name: 'Wind', cat: 'Pad', level: 0.55,
    oscs: [{ type: 'sine', ratio: 1, detune: 0, gain: 0.08, pan: 0 }],
    noise: 1.6,
    filter: { type: 'bandpass', freq: 523, q: 22, kt: 1, env: 0, a: 1, d: 1, s: 1 },
    amp: { a: 3, d: 2, s: 1, r: 6 },
    lfo: { target: 'filter', rate: 0.11, depth: 60 },
  },
  {
    id: 'drone', name: 'Sub Drone', cat: 'Pad', level: 0.2,
    oscs: [
      { type: 'sawtooth', ratio: 0.5, detune: 0, gain: 0.5, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: -8, gain: 0.35, pan: -0.5 },
      { type: 'square', ratio: 0.5, detune: 6, gain: 0.25, pan: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 420, q: 4, kt: 0.1, env: 200, a: 4, d: 4, s: 0.5 },
    amp: { a: 3, d: 2, s: 1, r: 7 },
    lfo: { target: 'filter', rate: 0.05, depth: 240 },
  },
  {
    id: 'bell', name: 'Glass Bell', cat: 'Keys', level: 0.24,
    oscs: [
      { type: 'sine', ratio: 1, detune: 0, gain: 0.6, pan: 0 },
      { type: 'sine', ratio: 2.76, detune: 0, gain: 0.22, pan: -0.4 },
      { type: 'sine', ratio: 5.4, detune: 0, gain: 0.09, pan: 0.4 },
      { type: 'triangle', ratio: 1, detune: 4, gain: 0.2, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 7000, q: 0.5, kt: 0, env: 0, a: 0.01, d: 1, s: 1 },
    amp: { a: 0.005, d: 2.8, s: 0, r: 2.8 },
  },
  {
    id: 'organ', name: 'Combo Organ', cat: 'Keys', level: 0.15,
    oscs: [
      { type: 'sine', ratio: 1, detune: 0, gain: 0.5, pan: 0 },
      { type: 'sine', ratio: 2, detune: 0, gain: 0.35, pan: -0.3 },
      { type: 'sine', ratio: 3, detune: 0, gain: 0.15, pan: 0.3 },
      { type: 'sine', ratio: 4, detune: 0, gain: 0.18, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 6000, q: 0.5, kt: 0, env: 0, a: 0.01, d: 1, s: 1 },
    amp: { a: 0.01, d: 0.1, s: 1, r: 0.15 },
    lfo: { target: 'pitch', rate: 6.3, depth: 7 },
  },
  {
    id: 'brass', name: 'Brass', cat: 'Lead', level: 0.16,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -5, gain: 0.5, pan: -0.3 },
      { type: 'sawtooth', ratio: 1, detune: 5, gain: 0.5, pan: 0.3 },
    ],
    filter: { type: 'lowpass', freq: 500, q: 2, kt: 0.5, env: 3500, a: 0.08, d: 0.6, s: 0.35 },
    amp: { a: 0.05, d: 0.3, s: 0.8, r: 0.4 },
  },
  {
    id: 'lead', name: 'Mono Lead', cat: 'Lead', level: 0.13,
    oscs: [
      { type: 'square', ratio: 1, detune: 0, gain: 0.5, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: 5, gain: 0.4, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 1500, q: 3, kt: 0.5, env: 1500, a: 0.02, d: 0.4, s: 0.5 },
    amp: { a: 0.02, d: 0.3, s: 0.85, r: 0.35 },
    lfo: { target: 'pitch', rate: 5, depth: 12 },
  },
];

PRESETS.push(
  // Tape-replay keyboard sounds: wow & flutter, per-key tuning drift,
  // narrow band, and notes that run out after 8 seconds like a tape strip.
  {
    id: 'tapeflute', name: 'Tape Flute', cat: 'Tape', level: 0.27,
    // Mostly a pure tone plus a filtered saw for the reedy edge (SOS "Practical Flute Synthesis":
    // low-pass ~2 kHz with a little key tracking, high-pass a few hundred Hz).
    oscs: [
      { type: 'sine', ratio: 1, detune: 0, gain: 0.5, pan: 0 },
      { type: 'triangle', ratio: 1, detune: 0, gain: 0.22, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: 0, gain: 0.12, pan: 0 },
      { type: 'sine', ratio: 2, detune: 0, gain: 0.06, pan: 0 },
    ],
    hp: 280,
    // the chiff comes from a bright burst of harmonics at the start, plus a faint breath
    filter: { type: 'lowpass', freq: 1900, q: 1.2, kt: 0.15, env: 2200, a: 0.02, d: 0.18, s: 0 },
    noise: 0.006,
    noiseTone: 1400,
    noiseChuff: { peak: 8, d: 0.12 },
    amp: { a: 0.09, d: 0.4, s: 0.9, r: 0.15 },
    lfo: [
      // wow: slow, irregular drift shared by all notes (one tape motor) plus a gentle sway
      { target: 'pitch', shape: 'drift', rate: 0.25, depth: 10 },
      { target: 'pitch', rate: 0.6, depth: 4 },
      // flutter: three fast components, as in common tape wow/flutter models (7, 11, 17 Hz)
      { target: 'pitch', rate: 7, depth: 2.5 },
      { target: 'pitch', rate: 11, depth: 1.5 },
      { target: 'pitch', rate: 17, depth: 0.8 },
      // the recorded flautist's breath vibrato: brightness, not loudness, at ~5.5 Hz
      { target: 'filter', rate: 5.5, depth: 190 },
      // level wavers irregularly with the tape
      { target: 'amp', shape: 'drift', rate: 1.2, depth: 0.05 },
    ],
    split: { below: 60, tone: 0.8, detune: 7 }, // alto flute below middle C, soprano above
    tapeDrift: 5,
    motorDrag: 1.5,
    maxLen: 8,
  },
  {
    id: 'tapestrings', name: 'Tape Strings', cat: 'Tape', level: 0.15,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -4, gain: 0.45, pan: -0.25 },
      { type: 'sawtooth', ratio: 1, detune: 4, gain: 0.45, pan: 0.25 },
      { type: 'square', ratio: 2, detune: 0, gain: 0.05, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 2000, q: 0.9, kt: 0.45, env: 400, a: 0.1, d: 0.6, s: 0.3 },
    amp: { a: 0.12, d: 0.6, s: 0.9, r: 0.25 },
    hp: 180,
    lfo: [
      { target: 'pitch', shape: 'drift', rate: 0.25, depth: 7 },
      { target: 'pitch', rate: 7, depth: 2 },
      { target: 'pitch', rate: 11, depth: 1.2 },
      { target: 'pitch', rate: 17, depth: 0.6 },
      { target: 'amp', shape: 'drift', rate: 1.2, depth: 0.04 },
    ],
    tapeDrift: 5,
    motorDrag: 1.5,
    maxLen: 8,
  },
);

PRESETS.push(
  // Classic analog basses.
  {
    // 70s mono-synth bass: two saws plus a sub square through a resonant ladder-style low-pass
    id: 'ladderbass', name: 'Ladder Bass', cat: 'Bass', level: 0.17,
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: 0, gain: 0.45, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: 7, gain: 0.25, pan: 0 },
      { type: 'square', ratio: 0.5, detune: -3, gain: 0.35, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 240, q: 6, kt: 0.5, env: 1800, a: 0.005, d: 0.35, s: 0.2 },
    amp: { a: 0.004, d: 0.4, s: 0.85, r: 0.12 },
  },
  {
    // bass-pedal style: deep, sustained and slow to bloom, to sit under pads
    id: 'pedalbass', name: 'Pedal Bass', cat: 'Bass', level: 0.18,
    oscs: [
      { type: 'sawtooth', ratio: 0.5, detune: 0, gain: 0.5, pan: 0 },
      { type: 'sawtooth', ratio: 1, detune: 9, gain: 0.3, pan: 0 },
      { type: 'sine', ratio: 0.5, detune: 0, gain: 0.4, pan: 0 },
    ],
    filter: { type: 'lowpass', freq: 320, q: 3, kt: 0.3, env: 900, a: 0.06, d: 1.2, s: 0.45 },
    amp: { a: 0.03, d: 1, s: 0.9, r: 0.9 },
    lfo: { target: 'filter', rate: 0.12, depth: 60 },
  },
);

const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

/* ------------------------------------------------------------------ */

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Small seeded RNG so the reverb sounds identical live and in exports.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Long, dark stereo reverb tail built from filtered noise.
function makeImpulse(ctx, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c), rnd = mulberry32(1234 + c * 99);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.5 * Math.pow(1 - t, 2) + 0.04; // gets darker over time
      y += k * (rnd() * 2 - 1 - y);
      const fadeIn = i < sr * 0.02 ? i / (sr * 0.02) : 1;
      d[i] = y * Math.pow(1 - t, 3) * fadeIn;
    }
  }
  return buf;
}

// Smooth random curve (-1..1) for irregular tape wow. One new random point every
// 0.25 s, eased between, 16 s long and seeded so exports match playback.
const DRIFT_LEN = 16;
function makeDrift(ctx) {
  const sr = ctx.sampleRate, n = sr * DRIFT_LEN, buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0), rnd = mulberry32(7);
  const pts = DRIFT_LEN * 4, v = [...Array(pts)].map(() => rnd() * 2 - 1);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * pts, k = Math.floor(x), fr = x - k;
    const a = v[k % pts], b = v[(k + 1) % pts], e = (1 - Math.cos(fr * Math.PI)) / 2;
    d[i] = a + (b - a) * e;
  }
  return buf;
}

function makeNoise(ctx) {
  const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0), rnd = mulberry32(42);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return buf;
}

/* Envelope helper: linear attack, exponential decay to sustain,
   exponential release. Values are computed analytically so a release
   can be scheduled at any time (live or in the future) without clicks. */
class Env {
  constructor(t0, a, d, base, peak, sus, r) {
    Object.assign(this, { t0, a: Math.max(a, 0.003), d: Math.max(d, 0.01), base, peak, sus, r, tr: null });
  }
  get tau() { return Math.max(this.r / 4, 0.005); }
  valueAt(t) {
    if (this.tr !== null && t >= this.tr) {
      const v = this._held(this.tr);
      return this.base + (v - this.base) * Math.exp(-(t - this.tr) / this.tau);
    }
    return this._held(t);
  }
  _held(t) {
    const dt = t - this.t0;
    if (dt <= 0) return this.base;
    if (dt < this.a) return this.base + (this.peak - this.base) * (dt / this.a);
    return this.sus + (this.peak - this.sus) * Math.exp(-(dt - this.a) / (this.d / 3));
  }
  start(param) {
    param.setValueAtTime(this.base, this.t0);
    param.linearRampToValueAtTime(this.peak, this.t0 + this.a);
    param.setTargetAtTime(this.sus, this.t0 + this.a, this.d / 3);
  }
  release(param, t, tauOverride) {
    const v = this.valueAt(t);
    const inAttack = t < this.t0 + this.a && (this.tr === null || t <= this.tr);
    param.cancelScheduledValues(t);
    // During the attack the curve is a straight line from t0, so ramping
    // to v at t reproduces it exactly even after the ramp end is cancelled.
    if (inAttack) param.linearRampToValueAtTime(v, t);
    else param.setValueAtTime(v, t);
    if (tauOverride) {
      param.setTargetAtTime(this.base, t, tauOverride);
    } else {
      this.tr = t;
      param.setTargetAtTime(this.base, t, this.tau);
    }
  }
}

class Voice {
  constructor(eng, p, midi, t0, dest) {
    const ctx = eng.ctx, s = eng.settings;
    this.eng = eng; this.midi = midi; this.t0 = t0; this.done = false; this.released = false;
    const f = midiToFreq(midi);
    const nyq = ctx.sampleRate / 2 * 0.9;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = p.filter.type;
    this.filter.Q.value = p.filter.q;

    const rel = p.amp.r * s.release;
    this.ampEnv = new Env(t0, p.amp.a * s.attack, p.amp.d, 0, p.level, p.level * p.amp.s, rel);

    // Keyboard split: the Mellotron flute's low notes came from a different (alto) flute,
    // so they're darker and sit slightly out of tune with the upper (soprano) notes.
    const low = p.split && midi < p.split.below;
    const splitTone = low ? p.split.tone : 1;
    const fBase = clamp(p.filter.freq * splitTone * s.tone * Math.pow(f / 261.63, p.filter.kt), 30, nyq);
    const fPeak = clamp(fBase + p.filter.env * s.tone, 30, nyq);
    const fSus = fBase + (fPeak - fBase) * p.filter.s;
    this.filtEnv = new Env(t0, p.filter.a * s.attack, p.filter.d, fBase, fPeak, fSus, rel);

    // Tape sounds: each key is slightly (and repeatably) out of tune.
    let drift = p.tapeDrift ? ((((midi * 37) % 11) / 10) - 0.5) * 2 * p.tapeDrift : 0;
    if (low) drift += p.split.detune;
    // Motor drag: holding many tape notes slows the motor, so new notes come in flat.
    if (p.motorDrag) {
      const busy = eng.active.filter((v) => v.tape && !v.released).length;
      drift -= Math.min(busy * p.motorDrag, p.motorDrag * 6);
    }
    this.tape = !!p.maxLen;

    this.sources = [];
    this.oscs = [];
    for (const o of p.oscs) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = f * o.ratio;
      osc.detune.value = (o.detune || 0) + drift;
      const g = ctx.createGain(); g.gain.value = o.gain;
      const pan = ctx.createStereoPanner(); pan.pan.value = o.pan || 0;
      osc.connect(g).connect(pan).connect(this.filter);
      this.sources.push(osc); this.oscs.push(osc);
    }
    if (p.noise) {
      const n = ctx.createBufferSource();
      n.buffer = eng.noiseBuf; n.loop = true;
      const g = ctx.createGain(); g.gain.value = p.noise;
      // optional chiff: a short breath burst at the start that settles to the base level
      if (p.noiseChuff) {
        g.gain.setValueAtTime(p.noise * p.noiseChuff.peak, t0);
        g.gain.setTargetAtTime(p.noise, t0 + 0.01, p.noiseChuff.d / 3);
      }
      let chain = n.connect(g);
      if (p.noiseTone) { // darken the noise so it reads as breath, not hiss
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = p.noiseTone; lp.Q.value = 0.5;
        chain = chain.connect(lp);
      }
      chain.connect(this.filter);
      this.sources.push(n);
      this._noise = n;
    }

    // amplitude wobble (tape flutter) needs its own gain stage
    const lfos = [].concat(p.lfo || []);
    let trem = null;
    if (lfos.some((l) => l.target === 'amp')) { trem = ctx.createGain(); trem.gain.value = 1; }
    const driftStarts = new Map();
    for (const l of lfos) {
      let lfo;
      if (l.shape === 'drift') {
        // every voice reads the same curve at the same moment, like one shared tape motor
        lfo = ctx.createBufferSource();
        lfo.buffer = eng.driftBuf; lfo.loop = true;
        lfo.playbackRate.value = l.rate;
        driftStarts.set(lfo, (t0 * l.rate) % DRIFT_LEN);
      } else {
        lfo = ctx.createOscillator();
        lfo.frequency.value = l.rate;
      }
      const lg = ctx.createGain(); lg.gain.value = l.depth;
      lfo.connect(lg);
      if (l.target === 'filter') lg.connect(this.filter.frequency);
      else if (l.target === 'amp') lg.connect(trem.gain);
      else this.oscs.forEach((o) => lg.connect(o.detune));
      this.sources.push(lfo);
    }

    let tail = this.filter;
    if (p.hp) { // thin out the lows, as on the Mellotron's tape replay
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = p.hp; hp.Q.value = 0.6;
      tail = tail.connect(hp);
    }
    if (trem) tail = tail.connect(trem);
    tail.connect(this.out).connect(dest || eng.synthIn);
    this.ampEnv.start(this.out.gain);
    this.filtEnv.start(this.filter.frequency);

    for (const src of this.sources) {
      // offset noise start per note so stacked notes don't share the same noise
      if (src === this._noise) src.start(t0, (midi * 0.137) % 2);
      else if (driftStarts.has(src)) src.start(t0, driftStarts.get(src));
      else src.start(t0);
    }
    this.sources[0].onended = () => this._cleanup();

    // Tape runs out: the note ends on its own after maxLen seconds.
    if (p.maxLen) {
      this.tapeEnd = t0 + p.maxLen;
      this.ampEnv.release(this.out.gain, this.tapeEnd, 0.06);
      this.sources.forEach((s) => s.stop(this.tapeEnd + 0.5));
    }
  }

  release(t) {
    if (this.released) return;
    if (this.tapeEnd !== undefined && t >= this.tapeEnd) { this.released = true; return; } // already ran out
    this.released = true;
    this.ampEnv.release(this.out.gain, t);
    this.filtEnv.release(this.filter.frequency, t);
    const end = t + this.ampEnv.tau * 7 + 0.05;
    this.sources.forEach((s) => { try { s.stop(end); } catch (e) {} });
  }

  // Fast fade-out (stop button / voice stealing).
  kill(t) {
    this.released = true;
    this.ampEnv.release(this.out.gain, t, 0.015);
    this.sources.forEach((s) => { try { s.stop(t + 0.12); } catch (e) {} });
  }

  _cleanup() {
    if (this.done) return;
    this.done = true;
    try { this.out.disconnect(); } catch (e) {}
    const a = this.eng.active, i = a.indexOf(this);
    if (i >= 0) a.splice(i, 1);
  }
}

// Track volume dial (0..1) to gain: 12 o'clock (0.5) is unity,
// fully up is 2× (+6 dB), fully down is silent.
// Master volume: 12 o'clock (0.5) is the normal level; fully up is about +3 dB.
function masterVolGain(v) {
  return v <= 0.5 ? Math.pow(v / 0.5, 2) * 0.9 : 0.9 + (v - 0.5) * 0.8;
}

function trackVolGain(v) {
  return v <= 0.5 ? Math.pow(v / 0.5, 2) : 1 + (v - 0.5) * 2;
}

// Soft tape-style clipping curve.
function tapeCurve(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

// An effect that can be switched in or out without clicks (crossfades dry/wet).
function makeSwitchStage(ctx, buildWet) {
  const input = ctx.createGain(), output = ctx.createGain();
  const dry = ctx.createGain(), wet = ctx.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  buildWet(input).connect(wet).connect(output);
  return {
    input, output,
    set(on, setParam) { setParam(dry.gain, on ? 0 : 1); setParam(wet.gain, on ? 1 : 0); },
  };
}

class Engine {
  // `settings` is kept by reference so the UI can change it live.
  constructor(ctx, settings) {
    this.ctx = ctx;
    this.settings = settings;
    this.active = [];
    this.maxVoices = 40;
    this.noiseBuf = makeNoise(ctx);
    this.driftBuf = makeDrift(ctx);

    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.bus = g();
    // per-track volume: track notes pass through these before the shared effects
    // Synth colour stages (tape saturation, then vintage EQ) sit between the tracks and the
    // shared effects. Drums join the bus after them, so they're unaffected.
    this.synthIn = g();
    this.sat = makeSwitchStage(ctx, (inp) => {
      const drive = ctx.createGain(); drive.gain.value = 2.2;
      const shaper = ctx.createWaveShaper(); shaper.curve = tapeCurve(2.5); shaper.oversample = '4x';
      const bump = ctx.createBiquadFilter(); bump.type = 'lowshelf'; bump.frequency.value = 90; bump.gain.value = 2.5;
      const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 9000; soft.Q.value = 0.5;
      const makeup = ctx.createGain(); makeup.gain.value = 0.22; // level-matched to bypass
      return inp.connect(drive).connect(shaper).connect(bump).connect(soft).connect(makeup);
    });
    this.veq = makeSwitchStage(ctx, (inp) => {
      // Thomann's Strawberry Fields tip: low-pass "around 550Hz"; plus a gentle bass cut
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 550; lp.Q.value = 0.6;
      const makeup = ctx.createGain(); makeup.gain.value = 1.07; // level-matched to bypass
      return inp.connect(hp).connect(lp).connect(makeup);
    });
    this.synthIn.connect(this.sat.input);
    this.sat.output.connect(this.veq.input);
    this.veq.output.connect(this.bus);

    this.trackGain = [g(), g()];
    this.trackPan = [ctx.createStereoPanner(), ctx.createStereoPanner()];
    this.trackGain.forEach((tg, i) => tg.connect(this.trackPan[i]).connect(this.synthIn));
    this.dry = g(); this.revSend = g(); this.delSend = g(); this.mix = g();

    // Reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 6);
    const revOut = g(0.9);

    // Ping-pong echo
    this.dl = ctx.createDelay(2); this.dr = ctx.createDelay(2);
    this.dl.delayTime.value = 0.42; this.dr.delayTime.value = 0.42;
    this.fb = g(0.45);
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.7;
    const pr = ctx.createStereoPanner(); pr.pan.value = 0.7;
    const delOut = g(); const echoToVerb = g(0.4);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01; this.comp.release.value = 0.3;
    this.vol = g();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.bus.connect(this.dry).connect(this.mix);
    this.bus.connect(this.revSend).connect(this.reverb).connect(revOut).connect(this.mix);
    this.bus.connect(this.delSend).connect(this.dl);
    this.dl.connect(dlf).connect(this.dr);
    this.dr.connect(this.fb).connect(this.dl);
    this.dl.connect(pl).connect(delOut);
    this.dr.connect(pr).connect(delOut);
    delOut.connect(this.mix);
    delOut.connect(echoToVerb).connect(this.reverb);
    this.mix.connect(this.comp).connect(this.vol).connect(this.analyser).connect(ctx.destination);

    // Drums: through the Space/Echo effects like the synth, or straight to the mix when bypassed.
    this.drumBus = g();
    this.drumToFx = g();
    this.drumDry = g(0);
    this.drumBus.connect(this.drumToFx).connect(this.bus);
    this.drumBus.connect(this.drumDry).connect(this.mix);

    this.applyMix(true);
  }

  applyMix(immediate) {
    const s = this.settings, t = this.ctx.currentTime;
    const set = (p, v) => (immediate ? (p.value = v) : p.setTargetAtTime(v, t, 0.05));
    set(this.dry.gain, 1 - s.space * 0.45);
    set(this.revSend.gain, s.space * 1.1);
    set(this.delSend.gain, s.echo * 0.7);
    set(this.fb.gain, 0.3 + s.echo * 0.3);
    set(this.vol.gain, masterVolGain(s.volume));
    set(this.drumBus.gain, (s.drums ?? 0.7) * 1.3);
    set(this.drumToFx.gain, s.drumFxBypass ? 0 : 1);
    set(this.drumDry.gain, s.drumFxBypass ? 1 : 0);
    set(this.trackGain[0].gain, trackVolGain(s.vol1 ?? 0.5));
    set(this.trackGain[1].gain, trackVolGain(s.vol2 ?? 0.5));
    set(this.trackPan[0].pan, s.pan1 ?? 0);
    set(this.trackPan[1].pan, s.pan2 ?? 0);
    this.sat.set(!!s.tapeSat, set);
    this.veq.set(!!s.vintageEq, set);
  }

  /* Analog-style rhythm box voices. */
  drum(inst, t, vel = 1) {
    const ctx = this.ctx, out = this.drumBus;
    const gain = (peak, dec, att = 0.001) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
      g.connect(out);
      return g;
    };
    const osc = (type, f, dur) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.setValueAtTime(f, t);
      o.start(t); o.stop(t + dur);
      return o;
    };
    const noise = (dur) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.start(t, (t * 0.37) % 1.5); n.stop(t + dur);
      return n;
    };
    const filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q;
      return b;
    };

    switch (inst) {
      case 'kick': {
        const o = osc('sine', 130, 0.5);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
        o.connect(gain(0.95 * vel, 0.38));
        break;
      }
      case 'snare': {
        const o = osc('triangle', 190, 0.15);
        o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
        o.connect(gain(0.3 * vel, 0.08));
        noise(0.25).connect(filt('highpass', 1200)).connect(filt('lowpass', 7000)).connect(gain(0.4 * vel, 0.17));
        break;
      }
      case 'hat':
        noise(0.1).connect(filt('highpass', 7000)).connect(filt('bandpass', 10000, 0.8)).connect(gain(0.35 * vel, 0.045));
        break;
      case 'shaker':
        noise(0.12).connect(filt('highpass', 5000)).connect(gain(0.2 * vel, 0.06, 0.012));
        break;
      case 'rim':
        osc('sine', 1700, 0.08).connect(gain(0.28 * vel, 0.035));
        osc('triangle', 820, 0.06).connect(gain(0.12 * vel, 0.02));
        break;
      case 'click':
        osc('sine', vel > 0.9 ? 2000 : 1400, 0.08).connect(gain(0.3, 0.04));
        break;
    }
  }

  // track: 0 or 1 to play through that track's volume, or undefined for none
  noteOn(preset, midi, t, track) {
    const v = new Voice(this, preset, midi, t, this.trackGain[track]);
    this.active.push(v);
    if (this.active.length > this.maxVoices) {
      const victim = this.active.find((x) => x.released) || this.active[0];
      victim.kill(Math.max(t, this.ctx.currentTime));
    }
    return v;
  }
}

/* ------------------------------------------------------------------
   Offline render of a take to a 16-bit stereo WAV blob.
------------------------------------------------------------------- */
async function renderTakeToWav(take, settings) {
  const sr = 44100;
  const maxRel = Math.max(0.5, ...take.notes.map((n) => presetById(n.preset).amp.r)) * settings.release;
  const seconds = take.length + maxRel * 1.8 + 7;
  const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const eng = new Engine(off, { ...settings });
  const T = 0.05;
  for (const n of take.notes) {
    eng.noteOn(presetById(n.preset), n.midi, T + n.start, n.track).release(T + n.end);
  }
  for (const h of take.hits || []) if (h.inst) eng.drum(h.inst, T + h.t, h.vel);
  const buf = await off.startRendering();
  return encodeWav(buf);
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));

  // Trim trailing silence (keep 0.25s).
  let n = buf.length;
  while (n > 0 && chans.every((d) => Math.abs(d[n - 1]) < 0.0003)) n--;
  n = Math.min(buf.length, n + Math.floor(sr * 0.25));

  const view = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, ch, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = clamp(chans[c][i], -1, 1);
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
