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

// Velocity used for the computer keyboard (MIDI 100 of 127); notes at this velocity sound as designed.
const DEFAULT_VEL = 100 / 127;

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
  // opts.vel: velocity 0..1 (computer keys use DEFAULT_VEL). opts.live: follows pitch bend / mod wheel.
  constructor(eng, p, midi, t0, dest, opts = {}) {
    const ctx = eng.ctx, s = eng.settings;
    this.eng = eng; this.midi = midi; this.t0 = t0; this.done = false; this.released = false;
    this.endTime = Infinity; // when the voice falls silent (set once its release is scheduled)
    const f = midiToFreq(midi);
    const nyq = ctx.sampleRate / 2 * 0.9;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = p.filter.type;
    this.filter.Q.value = p.filter.q;

    const rel = p.amp.r * s.release;
    // Velocity: louder and a little brighter when played harder. DEFAULT_VEL plays exactly as before.
    const vel = Math.max(0.01, Math.min(1, opts.vel ?? DEFAULT_VEL));
    const velGain = Math.pow(vel / DEFAULT_VEL, 1.4);
    const velBright = 0.6 + 0.4 * (vel / DEFAULT_VEL);
    const peak = p.level * velGain;
    this.ampEnv = new Env(t0, p.amp.a * s.attack, p.amp.d, 0, peak, peak * p.amp.s, rel);

    // Keyboard split: the Mellotron flute's low notes came from a different (alto) flute,
    // so they're darker and sit slightly out of tune with the upper (soprano) notes.
    const low = p.split && midi < p.split.below;
    const splitTone = low ? p.split.tone : 1;
    const fBase = clamp(p.filter.freq * splitTone * s.tone * Math.pow(f / 261.63, p.filter.kt), 30, nyq);
    const fPeak = clamp(fBase + p.filter.env * s.tone * velBright, 30, nyq);
    const fSus = fBase + (fPeak - fBase) * p.filter.s;
    this.filtEnv = new Env(t0, p.filter.a * s.attack, p.filter.d, fBase, fPeak, fSus, rel);

    // Tape sounds: each key is slightly (and repeatably) out of tune.
    let drift = p.tapeDrift ? ((((midi * 37) % 11) / 10) - 0.5) * 2 * p.tapeDrift : 0;
    if (low) drift += p.split.detune;
    // Motor drag: holding many tape notes slows the motor, so new notes come in flat.
    if (p.motorDrag) {
      // tape notes sounding at this moment (works the same live, on playback and in exports)
      const busy = eng.active.filter((v) => v.tape && v.t0 <= t0 && v.endTime > t0).length;
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
      if (opts.live) { // pitch bend and mod-wheel vibrato from a MIDI keyboard
        eng.bendOut.connect(osc.detune);
        eng.vibOut.connect(osc.detune);
      }
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
      // keep the filter wobble above 0 Hz (a negative cutoff would cut the sound out)
      if (l.target === 'filter') { lg.gain.value = Math.min(l.depth, fBase * 0.8); lg.connect(this.filter.frequency); }
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
      this.endTime = this.tapeEnd + 0.5;
      this.sources.forEach((s) => s.stop(this.endTime));
    }
  }

  release(t) {
    if (this.released) return;
    if (this.tapeEnd !== undefined && t >= this.tapeEnd) { this.released = true; return; } // already ran out
    this.released = true;
    this.ampEnv.release(this.out.gain, t);
    this.filtEnv.release(this.filter.frequency, t);
    // stop after 9 time constants (about −78 dB), so the stop itself is inaudible
    const end = t + this.ampEnv.tau * 9 + 0.05;
    this.endTime = Math.min(this.endTime, end);
    this.sources.forEach((s) => { try { s.stop(end); } catch (e) {} });
  }

  // Fast fade-out (stop button / voice stealing).
  kill(t) {
    this.released = true;
    this.ampEnv.release(this.out.gain, t, 0.015);
    this.endTime = Math.min(this.endTime, t + 0.12);
    this.sources.forEach((s) => { try { s.stop(t + 0.12); } catch (e) {} });
  }

  _cleanup() {
    if (this.done) return;
    this.done = true;
    try { this.out.disconnect(); } catch (e) {}
    for (const o of this.oscs) { // release the links to the shared bend / vibrato controls
      try { this.eng.bendOut.disconnect(o.detune); } catch (e) {}
      try { this.eng.vibOut.disconnect(o.detune); } catch (e) {}
    }
    const a = this.eng.active, i = a.indexOf(this);
    if (i >= 0) a.splice(i, 1);
  }
}

// Echo time in seconds: 0.42 s, or a dotted eighth (3/4 of a quarter note) when synced.
// In 6/8 the tempo counts dotted quarters, so a quarter note is 2/3 of a beat.
function echoTime(s) {
  if (!s.echoSync) return 0.42;
  const quarter = (60 / (s.bpm || 92)) / (s.ts === '6/8' ? 1.5 : 1);
  return Math.min(1.9, quarter * 0.75);
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
  // opts.master: { pre, analyse } turns on the export mix/master chain (see MIX_MASTER below).
  // opts.stem / opts.premaster: export output paths (see export.js).
  constructor(ctx, settings, opts = {}) {
    const M = opts.master || null;
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
    if (M) { // synth bus: clear sub rumble, trim low-mid mud
      const hp = biq(ctx, 'highpass', MIX_MASTER.synth.hp, 0.707);
      const mud = biq(ctx, 'peaking', MIX_MASTER.synth.mudHz, MIX_MASTER.synth.mudQ, MIX_MASTER.synth.mudDb);
      this.veq.output.connect(hp).connect(mud).connect(this.bus);
    } else this.veq.output.connect(this.bus);

    this.trackGain = [g(), g()];
    this.trackPan = [ctx.createStereoPanner(), ctx.createStereoPanner()];
    this.trackGain.forEach((tg, i) => tg.connect(this.trackPan[i]).connect(this.synthIn));
    this.dry = g(); this.revSend = g(); this.delSend = g(); this.mix = g();

    // Reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 6);
    const revOut = this.revOut = g(0.9);

    // Ping-pong echo
    this.dl = ctx.createDelay(2); this.dr = ctx.createDelay(2);
    this.dl.delayTime.value = 0.42; this.dr.delayTime.value = 0.42;
    this.fb = g(0.45);
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.7;
    const pr = ctx.createStereoPanner(); pr.pan.value = 0.7;
    const delOut = this.delOut = g(); const echoToVerb = g(0.4);

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
    // safety limiter last in the chain: catches peaks so the output never clips
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001; this.limiter.release.value = 0.06;
    if (M) {
      // master: gain staging → rumble filter → glue compression → air. Loudness and the
      // true-peak limiter are done afterwards on the rendered audio (masterChannels).
      const c = MIX_MASTER.glue;
      const pre = g(M.pre || 1);
      const hp = biq(ctx, 'highpass', c.hp, 0.707);
      const glue = comp(ctx, M.analyse ? 1 : c.ratio, c.threshold, c.attack, c.release, c.knee);
      const air = biq(ctx, 'highshelf', c.airHz, 0.707, c.airDb);
      this.mix.connect(pre).connect(hp).connect(glue).connect(air).connect(this.analyser).connect(ctx.destination);
    } else {
      if (opts.stem) {
        // stems: no shared bus compressor or limiter, so the stems add back up to the mix exactly
        this.mix.connect(this.vol).connect(this.analyser).connect(ctx.destination);
      } else if (opts.premaster) {
        // for a mastering engineer: the mix as heard, but no safety limiter (headroom is set afterwards)
        this.mix.connect(this.comp).connect(this.vol).connect(this.analyser).connect(ctx.destination);
      } else {
        this.mix.connect(this.comp).connect(this.vol).connect(this.limiter).connect(this.analyser).connect(ctx.destination);
      }
    }

    // Drums: through the Space/Echo effects like the synth, or straight to the mix when bypassed.
    // Live performance controls shared by played notes: pitch bend (cents) and mod-wheel vibrato.
    this.bendOut = ctx.createConstantSource();
    this.bendOut.offset.value = 0;
    this.bendOut.start();
    this.vibLfo = ctx.createOscillator();
    this.vibLfo.frequency.value = 5.5;
    this.vibOut = g(0);
    this.vibLfo.connect(this.vibOut);
    this.vibLfo.start();

    this.drumBus = g();
    this.drumPan = ctx.createStereoPanner(); // Rhythm track pan
    this.drumToFx = g();
    this.drumDry = g(0);
    this.drumBus.connect(this.drumPan);
    let drumOut = this.drumPan;
    if (M) { // drum bus: rumble filter, punch compression, a touch of air
      const d = MIX_MASTER.drums;
      drumOut = drumOut.connect(biq(ctx, 'highpass', d.hp, 0.707))
        .connect(comp(ctx, M.analyse ? 1 : d.ratio, d.threshold, d.attack, d.release, d.knee))
        .connect(biq(ctx, 'highshelf', d.airHz, 0.707, d.airDb))
        .connect(g(Math.pow(10, (M.analyse ? 0 : d.makeupDb) / 20)));
    }
    drumOut.connect(this.drumToFx).connect(this.bus);
    drumOut.connect(this.drumDry).connect(this.mix);

    this.applyMix(true);
  }

  applyMix(immediate) {
    const s = this.settings, t = this.ctx.currentTime;
    const set = (p, v) => (immediate ? (p.value = v) : p.setTargetAtTime(v, t, 0.05));
    // Bypass turns Echo and Space fully off, tails included.
    const fx = !s.fxOff;
    set(this.dry.gain, fx ? 1 - s.space * 0.45 : 1);
    set(this.revSend.gain, fx ? s.space * 1.1 : 0);
    set(this.delSend.gain, fx ? s.echo * 0.7 : 0);
    set(this.revOut.gain, fx ? 0.9 : 0);
    set(this.delOut.gain, fx ? 1 : 0);
    set(this.fb.gain, 0.3 + s.echo * 0.3);
    // Echo time: fixed 420 ms, or a dotted eighth at the current tempo when synced.
    const echo = echoTime(s);
    set(this.dl.delayTime, echo);
    set(this.dr.delayTime, echo);
    set(this.vol.gain, masterVolGain(s.volume));
    // drum Level knob × Rhythm track Vol dial (12 o'clock = unity)
    set(this.drumBus.gain, (s.drums ?? 0.7) * 1.3 * trackVolGain(s.vol3 ?? 0.5));
    set(this.drumPan.pan, s.pan3 ?? 0);
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
    const gains = [];
    const gain = (peak, dec, att = 0.001) => {
      const g = ctx.createGain();
      gains.push(g);
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
      case 'metro': { // metronome tick: a short woodblock, higher on the downbeat
        const f = vel > 0.9 ? 2100 : 1500;
        osc('sine', f, 0.06).connect(gain(0.32 * vel, 0.028));
        osc('triangle', f * 0.5, 0.05).connect(filt('bandpass', f * 0.5, 2)).connect(gain(0.18 * vel, 0.02));
        break;
      }
    }
    return gains;
  }

  // track: 0 or 1 to play through that track's volume, or undefined for none
  // Pitch bend in cents (smoothed so steps from the wheel don't zipper).
  setBend(cents) { this.bendOut.offset.setTargetAtTime(cents, this.ctx.currentTime, 0.008); }
  // Mod wheel 0..1 → vibrato depth up to ±35 cents.
  setMod(amount) { this.vibOut.gain.setTargetAtTime(amount * 35, this.ctx.currentTime, 0.03); }

  noteOn(preset, midi, t, track, opts) {
    const v = new Voice(this, preset, midi, t, this.trackGain[track], opts);
    this.active.push(v);
    // Steal only when more than maxVoices are sounding at time t (not merely scheduled):
    // prefer the oldest voice that's already releasing, else the oldest.
    const sounding = this.active.filter((x) => x !== v && x.t0 <= t && x.endTime > t && !x.done);
    if (sounding.length >= this.maxVoices) {
      const victim = sounding.find((x) => x.released && x.ampEnv.tr !== null && x.ampEnv.tr <= t) || sounding[0];
      victim.kill(Math.max(t, this.ctx.currentTime));
    }
    return v;
  }
}

/* ------------------------------------------------------------------
   Offline render of a take to a 16-bit stereo WAV blob.
------------------------------------------------------------------- */
/* ------------------------------------------------------------------
   Mix & master (export option). Settings from common practice for mixing synths
   and drum machines and mastering for streaming:
   - streaming: −14 LUFS (Spotify / YouTube / TIDAL), −16 LUFS (Apple Music, AES TD1008);
     true peak ≤ −1 dBTP everywhere
   - glue compression: gentle 2:1, slow-ish attack to keep transients, ~1–3 dB reduction
   - drum bus: high-pass 30–40 Hz, 3:1 with ~10 ms attack / ~100 ms release, a little 10 kHz air
   - synths: remove sub rumble, small cut in the 200–500 Hz "mud" zone, boosts kept under +3 dB
------------------------------------------------------------------- */
const MIX_MASTER = {
  stageLufs: -18, // the mix is brought here before the compressors, so they act the same on any take
  synth: { hp: 30, mudHz: 300, mudQ: 1, mudDb: -2 },
  drums: { hp: 30, ratio: 3, threshold: -8, attack: 0.01, release: 0.1, knee: 8, airHz: 10000, airDb: 1.5, makeupDb: 1.5 },
  glue: { hp: 25, ratio: 2, threshold: -16, attack: 0.03, release: 0.2, knee: 6, airHz: 12000, airDb: 1 },
  ceilingDbtp: -1,  // true-peak ceiling
  maxLimitDb: 6,    // never limit harder than this: quiet ambient pieces aren't crushed to hit a number
};

function biq(ctx, type, freq, q, gainDb = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = freq; b.Q.value = q; b.gain.value = gainDb;
  return b;
}
function comp(ctx, ratio, threshold, attack, release, knee) {
  const c = ctx.createDynamicsCompressor();
  c.ratio.value = ratio; c.threshold.value = threshold; c.attack.value = attack; c.release.value = release; c.knee.value = knee;
  return c;
}

// RBJ biquad coefficients, and running a filter over an array (used for loudness metering).
function rbjCoefs(type, f, sr, q, gainDb = 0) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { // highshelf
    const r = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + (A - 1) * cs + r); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - r);
    a0 = (A + 1) - (A - 1) * cs + r; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - r;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function runBiquad(x, c) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Integrated loudness (ITU-R BS.1770-4): K-weighting, 400 ms blocks with 75% overlap,
// absolute gate at −70 LUFS, relative gate 10 LU below.
function integratedLoudness(chans, sr) {
  const shelf = rbjCoefs('highshelf', 1681.97, sr, 0.7072, 4.0), hp = rbjCoefs('highpass', 38.135, sr, 0.5003);
  const n = chans[0].length, block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  if (n < block) return -Infinity;
  const sums = chans.map((c) => {
    const k = runBiquad(runBiquad(c, shelf), hp);
    const p = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + k[i] * k[i];
    return p;
  });
  const z = [];
  for (let s = 0; s + block <= n; s += hop) {
    let v = 0;
    for (const p of sums) v += (p[s + block] - p[s]) / block;
    z.push(v);
  }
  const lk = (v) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => lk(v) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((v) => lk(v) > rel);
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// True peak (dBTP): 4× oversampling with a windowed-sinc interpolator, checked near loud samples.
function truePeakDb(chans) {
  const taps = 16, kern = [1, 2, 3].map((ph) => {
    const t = ph / 4, k = [];
    for (let j = -taps + 1; j <= taps; j++) {
      const x = t - j, sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * x / taps) + 0.08 * Math.cos(2 * Math.PI * x / taps); // Blackman
      k.push(sinc * w);
    }
    return k;
  });
  let peak = 0;
  for (const c of chans) {
    let sp = 0;
    for (let i = 0; i < c.length; i++) sp = Math.max(sp, Math.abs(c[i]));
    peak = Math.max(peak, sp);
    const near = sp * 0.5; // only look between samples close to the loudest ones
    for (let i = taps; i < c.length - taps; i++) {
      if (Math.abs(c[i]) < near && Math.abs(c[i + 1]) < near) continue;
      for (const k of kern) {
        let v = 0;
        for (let j = 0; j < k.length; j++) v += c[i - taps + 1 + j] * k[j];
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
  }
  return 20 * Math.log10(peak || 1e-9);
}

// Look-ahead brickwall limiter (1.5 ms look-ahead, 80 ms release), in place.
// Returns the most gain reduction applied, in dB.
function limitInPlace(chans, ceilingLin, sr) {
  const n = chans[0].length, la = Math.max(1, Math.round(0.0015 * sr)), rel = Math.exp(-1 / (0.08 * sr));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chans) m = Math.max(m, Math.abs(c[i]));
    need[i] = m > ceilingLin ? ceilingLin / m : 1;
  }
  // smallest gain needed anywhere in the next `la` samples (sliding-window minimum)
  const ahead = new Float32Array(n), dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[dq[tail - 1]] >= need[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + la) head++;
    ahead[i] = need[dq[head]];
  }
  // instant attack (already looking ahead), smooth release, then a box filter so the gain
  // ramps down over the look-ahead and reaches the target exactly at the peak
  let h = 1, sum = la + 1, minG = 1;
  const hist = new Float32Array(la + 1).fill(1); // start from "no gain reduction"
  for (let i = 0; i < n; i++) {
    h = ahead[i] < h ? ahead[i] : ahead[i] + (h - ahead[i]) * rel;
    sum += h - hist[i % (la + 1)];
    hist[i % (la + 1)] = h;
    const gval = sum / (la + 1);
    if (gval < minG) minG = gval;
    for (const c of chans) c[i] *= gval;
  }
  return -20 * Math.log10(minG);
}

// Bring the mix to the target loudness without exceeding −1 dBTP or limiting more than 6 dB.
async function masterChannels(chans, sr, targetLufs, onProgress) {
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const start = integratedLoudness(chans, sr);
  if (!Number.isFinite(start)) return { chans, lufs: start, tp: truePeakDb(chans), limitDb: 0 };
  let gainDb = targetLufs - start, ceilDb = MIX_MASTER.ceilingDbtp - 0.3, out = chans, lufs = start, tp = 0, limitDb = 0;
  for (let pass = 0; pass < 5; pass++) {
    onProgress && onProgress(0.72 + 0.03 * pass, 'master', 'Mastering: loudness and limiter…');
    await pause();
    const gl = Math.pow(10, gainDb / 20);
    out = chans.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * gl; return o; });
    limitDb = limitInPlace(out, Math.pow(10, ceilDb / 20), sr);
    if (limitDb > MIX_MASTER.maxLimitDb + 0.1) { gainDb -= limitDb - MIX_MASTER.maxLimitDb; continue; } // too much limiting: back off
    tp = truePeakDb(out);
    if (tp > MIX_MASTER.ceilingDbtp) { ceilDb -= tp - MIX_MASTER.ceilingDbtp + 0.05; continue; }      // inter-sample overs
    lufs = integratedLoudness(out, sr);
    if (Math.abs(lufs - targetLufs) < 0.3 || limitDb > MIX_MASTER.maxLimitDb - 0.5) break;
    gainDb += targetLufs - lufs;
  }
  return { chans: out, lufs, tp, limitDb };
}

/* Offline render of a take to WAV.
   format: { sampleRate, bits } — 48 kHz / 24-bit by default; 16-bit gets TPDF dither. */
// Render a take's audio (AudioBuffer). onProgress(fraction 0–1, detail).
async function renderTakeAudio(take, settings, sr, engineOpts, onProgress) {
  const maxRel = Math.max(0.5, ...take.notes.map((n) => presetById(n.preset).amp.r)) * settings.release;
  const seconds = take.length + maxRel * 2 + 12; // room for the full reverb + echo tail
  const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const eng = new Engine(off, { ...settings }, engineOpts);
  const T = 0.05;
  const notes = [...take.notes].sort((a, b) => a.start - b.start); // time order, as when played
  for (const n of notes) eng.noteOn(presetById(n.preset), n.midi, T + n.start, n.track, { vel: n.vel }).release(T + n.end);
  for (const h of take.hits || []) if (h.inst) eng.drum(h.inst, T + h.t, h.vel);

  // Progress: pause the render at 40 points (aligned to 128-sample blocks), report, resume.
  // If onProgress throws (e.g. the person pressed Cancel), the render stops there and rejects.
  return new Promise((resolve, reject) => {
    if (onProgress && typeof off.suspend === 'function') {
      const total = off.length / sr, steps = 40, seen = new Set();
      for (let k = 1; k < steps; k++) {
        const at = (Math.floor((total * k / steps) * sr / 128) * 128) / sr;
        if (at <= 0 || seen.has(at)) continue;
        seen.add(at);
        off.suspend(at).then(() => {
          try { onProgress(at / total, `${at.toFixed(1)} s of ${total.toFixed(1)} s`); } catch (err) { reject(err); return; }
          off.resume();
        });
      }
    }
    off.startRendering().then(resolve, reject);
  });
}

// Render a take to a WAV blob. master: null, or { lufs } to apply the mix & master chain.
// onProgress(fraction, step, detail). The returned blob carries .master = { lufs, tp, limitDb } when mastered.
async function renderTakeToWav(take, settings, format = { sampleRate: 48000, bits: 24 }, onProgress, master = null) {
  const sr = format.sampleRate, p = onProgress || (() => {});
  let buf, report = null;
  if (!master) {
    p(0, 'render', 'Rendering…');
    buf = await renderTakeAudio(take, settings, sr, {}, (f, d) => p(0.9 * f, 'render', `Rendering ${d}`));
  } else {
    // 1) analyse the level, 2) render through the mix chain at a fixed gain stage, 3) loudness + limiter
    p(0, 'render', 'Analysing levels…');
    // (the level check only needs loudness, so it renders at half the sample rate: twice as fast)
    const asr = Math.round(sr / 2);
    const a = await renderTakeAudio(take, settings, asr, { master: { pre: 1, analyse: true } }, (f, d) => p(0.25 * f, 'render', `Analysing levels ${d}`));
    const L = integratedLoudness([a.getChannelData(0), a.getChannelData(1)], asr);
    const pre = Number.isFinite(L) ? Math.pow(10, Math.max(-24, Math.min(24, MIX_MASTER.stageLufs - L)) / 20) : 1;
    const b = await renderTakeAudio(take, settings, sr, { master: { pre } }, (f, d) => p(0.25 + 0.45 * f, 'render', `Mixing ${d}`));
    const res = await masterChannels([b.getChannelData(0), b.getChannelData(1)], sr, master.lufs, p);
    buf = new AudioBuffer({ length: b.length, numberOfChannels: 2, sampleRate: sr });
    res.chans.forEach((c, i) => buf.copyToChannel(c, i));
    report = { lufs: res.lufs, tp: res.tp, limitDb: res.limitDb, target: master.lufs };
  }
  const blob = await encodeWav(buf, format.bits, onProgress);
  if (report) blob.master = report;
  return blob;
}

async function encodeWav(buf, bits = 24, onProgress) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));

  // Trim the silent end (below −90 dBFS), keeping 0.5 s, then fade the last 0.5 s
  // with a cosine so the file ends on true digital silence.
  let n = buf.length;
  while (n > 0 && chans.every((d) => Math.abs(d[n - 1]) < 3e-5)) n--;
  n = Math.min(buf.length, n + Math.floor(sr * 0.5));
  const fade = Math.min(n, Math.floor(sr * 0.5));

  // Never clip: if anything would reach full scale, lower the whole file to peak at −0.3 dBFS.
  let peak = 0;
  for (const d of chans) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const gain = peak > 0.97 ? 0.966 / peak : 1;

  const bytes = bits / 8, full = 2 ** (bits - 1) - 1;
  const view = new DataView(new ArrayBuffer(44 + n * ch * bytes));
  const str = (o, txt) => [...txt].forEach((c, k) => view.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + n * ch * bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, ch, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * bytes, true); view.setUint16(32, ch * bytes, true); view.setUint16(34, bits, true);
  str(36, 'data'); view.setUint32(40, n * ch * bytes, true);

  const rnd = mulberry32(99);
  const dither = bits === 16; // TPDF dither (±1 LSB) so quiet tails don't turn gritty
  let o = 44;
  const chunk = sr * 2; // yield every 2 s of audio so the progress bar keeps moving
  for (let i = 0; i < n; i++) {
    if (onProgress && i % chunk === 0) {
      onProgress(0.9 + 0.1 * (i / n), 'encode', 'Encoding…');
      await new Promise((r) => setTimeout(r, 0));
    }
    const g = i >= n - fade ? gain * 0.5 * (1 + Math.cos(Math.PI * (i - (n - fade)) / fade)) : gain;
    for (let c = 0; c < ch; c++) {
      let v = chans[c][i] * g * full;
      if (dither) v += rnd() - rnd();
      v = Math.max(-full - 1, Math.min(full, Math.round(v)));
      if (bytes === 2) view.setInt16(o, v, true);
      else { view.setUint8(o, v & 255); view.setUint8(o + 1, (v >> 8) & 255); view.setUint8(o + 2, (v >> 16) & 255); }
      o += bytes;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
