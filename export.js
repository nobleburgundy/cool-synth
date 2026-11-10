'use strict';

/* ==================================================================
   Professional export: masters, stems, files for a mastering engineer
   and release packs. Builds on the render / mastering code in synth.js.
   ================================================================== */

const EXPORT_LEAD = 0.05; // renderTakeAudio starts the music this far in; trimmed so files start at 0

const FORMATS = {
  'wav24-44': { label: 'WAV · 24-bit · 44.1 kHz', ext: 'wav', sr: 44100, bits: 24 },
  'wav24-48': { label: 'WAV · 24-bit · 48 kHz', ext: 'wav', sr: 48000, bits: 24 },
  'wav24-96': { label: 'WAV · 24-bit · 96 kHz', ext: 'wav', sr: 96000, bits: 24 },
  'wav32f-48': { label: 'WAV · 32-bit float · 48 kHz', ext: 'wav', sr: 48000, bits: 32, float: true },
  'wav16-44': { label: 'WAV · 16-bit · 44.1 kHz (CD, dithered)', ext: 'wav', sr: 44100, bits: 16 },
  'flac24-48': { label: 'FLAC · 24-bit · 48 kHz (lossless, smaller)', ext: 'flac', sr: 48000, bits: 24 },
  'flac16-44': { label: 'FLAC · 16-bit · 44.1 kHz (lossless, CD)', ext: 'flac', sr: 44100, bits: 16 },
  'mp3-320': { label: 'MP3 · 320 kbps (for sharing)', ext: 'mp3', sr: 44100, bits: 16, lossy: true },
};
// older saved settings used '24' / '16'
const formatId = (id) => (FORMATS[id] ? id : id === '16' ? 'wav16-44' : 'wav24-48');

/* ---------------- take helpers ---------------- */

// Repeat a take N times back to back (for long-form ambient pieces).
function loopTake(take, loops) {
  if (!(loops > 1)) return take;
  const rep = (arr, f) => arr && [...Array(loops)].flatMap((_, k) => arr.map((x) => f(x, k * take.length)));
  const note = (n, off) => ({ ...n, start: n.start + off, end: n.end + off });
  return {
    ...take,
    notes: rep(take.notes, note),
    tracks: take.tracks && take.tracks.map((t) => rep(t, note)),
    hits: rep(take.hits || [], (h, off) => ({ ...h, t: h.t + off })),
    length: take.length * loops,
  };
}

/* ---------------- DSP helpers ---------------- */

function lowpassCoefs(f, sr, q) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return { b0: (1 - cs) / 2 / a0, b1: (1 - cs) / a0, b2: (1 - cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 };
}

// Mono bass: everything below `freq` is made mono with a Linkwitz-Riley crossover (4th order):
// out = highpass(own side) + lowpass(mid). LR4 low + high bands sum to a flat (all-pass) response,
// so nothing is lost or doubled at the crossover.
function monoBassInPlace(chans, sr, freq = 120) {
  if (chans.length < 2) return;
  const lp = lowpassCoefs(freq, sr, Math.SQRT1_2), hp = rbjCoefs('highpass', freq, sr, Math.SQRT1_2);
  const [L, R] = chans, n = L.length, mid = new Float32Array(n);
  for (let i = 0; i < n; i++) mid[i] = (L[i] + R[i]) / 2;
  const low = runBiquad(runBiquad(mid, lp), lp);
  const hiL = runBiquad(runBiquad(L, hp), hp), hiR = runBiquad(runBiquad(R, hp), hp);
  for (let i = 0; i < n; i++) { L[i] = hiL[i] + low[i]; R[i] = hiR[i] + low[i]; }
}

// Trim the lead-in, set the end (full reverb tail or a fixed tail), apply fades.
function finishChans(chans, sr, { musicEnd, tail = 'full', fadeIn = 0, fadeOut = 0 }) {
  const start = Math.round(EXPORT_LEAD * sr);
  let end;
  if (tail === 'full') {
    end = chans[0].length;
    while (end > start && chans.every((d) => Math.abs(d[end - 1]) < 3e-5)) end--; // below −90 dBFS
    end = Math.min(chans[0].length, Math.max(end, Math.round((EXPORT_LEAD + musicEnd) * sr)) + Math.round(0.5 * sr));
  } else {
    end = Math.min(chans[0].length, Math.round((EXPORT_LEAD + musicEnd + Number(tail)) * sr));
  }
  const n = Math.max(1, end - start);
  const out = chans.map((c) => c.slice(start, start + n));
  const fin = Math.min(n, Math.round(fadeIn * sr));
  const fout = Math.min(n, Math.round(Math.max(fadeOut, tail === 'full' ? 0.5 : 0.02) * sr)); // never end on a click
  for (const c of out) {
    for (let i = 0; i < fin; i++) c[i] *= 0.5 * (1 - Math.cos(Math.PI * i / fin));
    for (let i = 0; i < fout; i++) c[n - 1 - i] *= 0.5 * (1 - Math.cos(Math.PI * i / fout));
  }
  return out;
}

function peakOf(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}
function scaleInPlace(chans, g) { if (g !== 1) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g; }

// High-quality sample-rate conversion (Blackman-windowed sinc, 32 zero crossings).
function resample(chans, srIn, srOut) {
  if (srIn === srOut) return chans;
  const ratio = srOut / srIn, zc = 32, cut = Math.min(1, ratio) * 0.96;
  return chans.map((x) => {
    const n = Math.floor(x.length * ratio), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / ratio, c0 = Math.floor(t);
      let s = 0;
      const span = Math.ceil(zc / cut);
      for (let j = c0 - span + 1; j <= c0 + span; j++) {
        if (j < 0 || j >= x.length) continue;
        const d = (t - j) * cut;
        if (Math.abs(d) >= zc) continue;
        const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        const w = 0.42 + 0.5 * Math.cos(Math.PI * d / zc) + 0.08 * Math.cos(2 * Math.PI * d / zc);
        s += x[j] * sinc * w;
      }
      y[i] = s * cut;
    }
    return y;
  });
}

/* ---------------- analysis (loudness report) ---------------- */

// Integrated loudness, loudness range (EBU Tech 3342), short-term max, true peak, stereo checks.
function analyseChans(chans, sr) {
  const shelf = rbjCoefs('highshelf', 1681.97, sr, 0.7072, 4.0), hp = rbjCoefs('highpass', 38.135, sr, 0.5003);
  const n = chans[0].length;
  const sums = chans.map((c) => {
    const k = runBiquad(runBiquad(c, shelf), hp), p = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + k[i] * k[i];
    return p;
  });
  const lk = (v) => -0.691 + 10 * Math.log10(v);
  const ms = (s, len) => sums.reduce((a, p) => a + (p[s + len] - p[s]) / len, 0);
  // short-term (3 s windows every 100 ms)
  const st = [], len3 = Math.round(3 * sr), hop = Math.round(0.1 * sr);
  for (let s = 0; s + len3 <= n; s += hop) st.push(ms(s, len3));
  let lra = 0, stMax = -Infinity;
  if (st.length) {
    stMax = Math.max(...st.map(lk));
    const abs = st.filter((v) => lk(v) > -70);
    if (abs.length) {
      const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 20;
      const g = abs.filter((v) => lk(v) > rel).map(lk).sort((a, b) => a - b);
      if (g.length) lra = g[Math.min(g.length - 1, Math.floor(g.length * 0.95))] - g[Math.floor(g.length * 0.1)];
    }
  }
  const lufs = integratedLoudness(chans, sr), tp = truePeakDb(chans);
  // stereo: correlation (full band and below 150 Hz) and the loudness lost when folded to mono
  let corr = 1, lowCorr = 1, monoLoss = 0;
  if (chans.length === 2) {
    const [L, R] = chans;
    const cor = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : 1; };
    corr = cor(L, R);
    const lp = lowpassCoefs(120, sr, Math.SQRT1_2); // steep (4th-order) split, same as Mono bass
    lowCorr = cor(runBiquad(runBiquad(L, lp), lp), runBiquad(runBiquad(R, lp), lp));
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
    const lm = integratedLoudness([mono, mono], sr);
    monoLoss = Number.isFinite(lm) && Number.isFinite(lufs) ? lufs - lm : 0;
  }
  return { lufs, lra, stMax, tp, plr: tp - lufs, corr, lowCorr, monoLoss, seconds: n / sr };
}

function analysisWarnings(a) {
  const w = [];
  if (a.corr < 0) w.push('The stereo channels are out of phase overall: the mix may sound thin or quiet in mono.');
  else if (a.monoLoss > 4.5) w.push(`Folding to mono loses ${a.monoLoss.toFixed(1)} dB: wide parts may disappear on mono speakers.`);
  if (a.lowCorr < 0.5) w.push('The low end is very wide: switch on Mono bass for club and mono playback.');
  if (a.tp > -1) w.push(`True peak is ${a.tp.toFixed(1)} dBTP: streaming services recommend −1 dBTP or lower.`);
  return w;
}

function reportText(title, a, extra = []) {
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const mm = Math.floor(a.seconds / 60), ss = (a.seconds - mm * 60).toFixed(1).padStart(4, '0');
  return [
    `${title}`, '',
    `Length                ${mm}:${ss}`,
    `Integrated loudness   ${f(a.lufs)} LUFS`,
    `Short-term max        ${f(a.stMax)} LUFS`,
    `Loudness range (LRA)  ${f(a.lra)} LU`,
    `True peak             ${f(a.tp, 2)} dBTP`,
    `Peak-to-loudness      ${f(a.plr)} dB`,
    a.limitDb !== undefined ? `Limiter (max)         ${f(a.limitDb)} dB` : null,
    `Stereo correlation    ${f(a.corr, 2)} (below 120 Hz: ${f(a.lowCorr, 2)})`,
    `Mono fold-down        ${f(-a.monoLoss)} dB`,
    ...extra,
    '', ...(analysisWarnings(a).length ? ['Notes:', ...analysisWarnings(a).map((x) => `  • ${x}`)] : ['No issues found.']),
  ].filter((x) => x !== null).join('\n');
}

/* ---------------- products ---------------- */

/* Render one stereo product.
   kind: 'master' (with master = { lufs } for the mix & master chain, or null), 'premaster' (−6 dBFS headroom)
   Returns { chans, sr, analysis }. */
async function renderProduct({ take, settings, kind, master, monoBass, loops, fadeIn, fadeOut, tail, sr, onProgress }) {
  const p = onProgress || (() => {});
  const t = loopTake(take, loops);
  let chans, limitDb;
  if (kind === 'master' && master) {
    const asr = Math.round(sr / 2);
    const a = await renderTakeAudio(t, settings, asr, { master: { pre: 1, analyse: true } }, (f, d) => p(0.2 * f, `Analysing levels ${d}`));
    const L = integratedLoudness([a.getChannelData(0), a.getChannelData(1)], asr);
    const pre = Number.isFinite(L) ? Math.pow(10, Math.max(-24, Math.min(24, MIX_MASTER.stageLufs - L)) / 20) : 1;
    const b = await renderTakeAudio(t, settings, sr, { master: { pre } }, (f, d) => p(0.2 + 0.5 * f, `Mixing ${d}`));
    chans = [b.getChannelData(0), b.getChannelData(1)];
    if (monoBass) monoBassInPlace(chans, sr);
    const res = await masterChannels(chans, sr, master.lufs, (f, s, d) => p(0.72, d));
    chans = res.chans; limitDb = res.limitDb;
  } else {
    const b = await renderTakeAudio(t, settings, sr, kind === 'premaster' ? { premaster: true } : {}, (f, d) => p(0.7 * f, `Rendering ${d}`));
    chans = [b.getChannelData(0), b.getChannelData(1)];
    if (monoBass) monoBassInPlace(chans, sr);
  }
  p(0.8, 'Finishing: length and fades…');
  chans = finishChans(chans, sr, { musicEnd: t.length, tail, fadeIn, fadeOut });
  const pk = peakOf(chans);
  if (kind === 'premaster') scaleInPlace(chans, pk > 0 ? 0.5012 / pk : 1); // peaks at −6 dBFS: headroom for mastering
  else if (!master && pk > 0.966) scaleInPlace(chans, 0.966 / pk);           // never clip (−0.3 dBFS)
  p(0.86, 'Measuring loudness…');
  const analysis = analyseChans(chans, sr);
  if (limitDb !== undefined) analysis.limitDb = limitDb;
  if (master) analysis.target = master.lufs;
  return { chans, sr, analysis };
}

/* Stems: one file per track (and the drums), all the same length, starting together.
   fx: 'wet' keeps each part's reverb and echo; 'dry' leaves them off. */
async function renderStems({ take, settings, mute, fx, monoBass, loops, fadeIn, fadeOut, tail, sr, onProgress }) {
  const p = onProgress || (() => {});
  const t = loopTake(take, loops);
  const parts = [];
  if (t.tracks[0] && t.tracks[0].length && !mute[0]) parts.push(['Track 1', { ...t, notes: t.tracks[0].map((n) => ({ ...n, track: 0 })), hits: [] }]);
  if (t.tracks[1] && t.tracks[1].length && !mute[1]) parts.push(['Track 2', { ...t, notes: t.tracks[1].map((n) => ({ ...n, track: 1 })), hits: [] }]);
  if (t.hits.some((h) => h.inst) && !mute[2]) parts.push(['Rhythm', { ...t, notes: [], hits: t.hits }]);
  const s = { ...settings, fxOff: fx === 'dry' ? true : settings.fxOff };
  const raw = [];
  for (let i = 0; i < parts.length; i++) {
    const [name, part] = parts[i];
    const b = await renderTakeAudio(part, s, sr, { stem: true }, (f, d) => p((i + f) / parts.length * 0.8, `${name} stem ${d}`));
    const chans = [b.getChannelData(0), b.getChannelData(1)];
    if (monoBass) monoBassInPlace(chans, sr);
    raw.push([name, chans]);
  }
  // one common length for every stem: with a full tail, wherever the last stem falls silent
  let stemTail = tail;
  if (tail === 'full') {
    const lead = Math.round(EXPORT_LEAD * sr);
    let last = Math.round((EXPORT_LEAD + t.length) * sr);
    for (const [, c] of raw) {
      let e = c[0].length;
      while (e > lead && c.every((d) => Math.abs(d[e - 1]) < 3e-5)) e--;
      last = Math.max(last, e);
    }
    stemTail = Math.max(0, (last - lead) / sr - t.length) + 0.5;
  }
  const out = raw.map(([name, c]) => [name, finishChans(c, sr, { musicEnd: t.length, tail: stemTail, fadeIn, fadeOut: tail === 'full' ? Math.max(fadeOut, 0.5) : fadeOut })]);
  // keep the stems' balance: one shared safety gain if anything would clip
  const pk = Math.max(...out.map(([, c]) => peakOf(c)));
  if (pk > 0.966) for (const [, c] of out) scaleInPlace(c, 0.966 / pk);
  return out;
}

/* ---------------- encoders ---------------- */

const enc = new TextEncoder();

// WAV with an INFO chunk (title, artist, …). bits: 16 (TPDF dither), 24, or 32 (float).
function encodeWavFile(chans, sr, bits, meta = {}, float = false) {
  const ch = chans.length, n = chans[0].length, bytes = bits / 8;
  const info = wavInfoChunk(meta);
  const fmtSize = float ? 18 : 16, fact = float ? 12 : 0;
  const dataSize = n * ch * bytes;
  const total = 12 + 8 + fmtSize + fact + info.length + 8 + dataSize;
  const buf = new ArrayBuffer(total), v = new DataView(buf), u8 = new Uint8Array(buf);
  let o = 0;
  const str = (s) => { for (let i = 0; i < 4; i++) v.setUint8(o++, s.charCodeAt(i)); };
  const u32 = (x) => { v.setUint32(o, x, true); o += 4; }, u16 = (x) => { v.setUint16(o, x, true); o += 2; };
  str('RIFF'); u32(total - 8); str('WAVE');
  str('fmt '); u32(fmtSize); u16(float ? 3 : 1); u16(ch); u32(sr); u32(sr * ch * bytes); u16(ch * bytes); u16(bits);
  if (float) { u16(0); str('fact'); u32(4); u32(n); }
  u8.set(info, o); o += info.length;
  str('data'); u32(dataSize);
  const full = 2 ** (bits - 1) - 1, rnd = mulberry32(99);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const x = chans[c][i];
      if (float) { v.setFloat32(o, x, true); o += 4; continue; }
      let s = x * full;
      if (bits === 16) s += rnd() - rnd();
      s = Math.max(-full - 1, Math.min(full, Math.round(s)));
      if (bytes === 2) v.setInt16(o, s, true);
      else { v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); }
      o += bytes;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function wavInfoChunk(meta) {
  const tags = [['INAM', meta.title], ['IART', meta.artist], ['IPRD', meta.album], ['ICRD', meta.year], ['IGNR', meta.genre],
    ['ICOP', meta.copyright], ['ICMT', meta.comment], ['ISFT', 'cs-10 Ambient Synthesizer']].filter(([, x]) => x);
  if (!tags.length) return new Uint8Array(0);
  const parts = tags.map(([id, x]) => {
    const b = enc.encode(String(x)), size = b.length + 1, pad = size % 2;
    const out = new Uint8Array(8 + size + pad), v = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
    v.setUint32(4, size, true); out.set(b, 8);
    return out;
  });
  const body = parts.reduce((a, b) => a + b.length, 0) + 4;
  const out = new Uint8Array(8 + body), v = new DataView(out.buffer);
  out.set([76, 73, 83, 84]); v.setUint32(4, body, true); out.set([73, 78, 70, 79], 8); // 'LIST' … 'INFO'
  let o = 12;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* FLAC encoder: fixed linear prediction (orders 0–4) with Rice-coded residuals, independent
   channels, 4096-sample blocks, Vorbis comments for the metadata. */
class BitWriter {
  constructor(cap = 1 << 20) { this.buf = new Uint8Array(cap); this.pos = 0; this.acc = 0; this.n = 0; }
  grow(k) { if (this.pos + k >= this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + k + 1024)); b.set(this.buf); this.buf = b; } }
  write(v, n) { // v: unsigned, n ≤ 32
    if (n > 24) { this.write(Math.floor(v / 16777216), n - 24); this.write(v % 16777216, 24); return; }
    if (!n) return;
    this.grow(8);
    this.acc = (this.acc << n) | (v & ((1 << n) - 1));
    this.n += n;
    while (this.n >= 8) { this.n -= 8; this.buf[this.pos++] = (this.acc >>> this.n) & 255; }
    this.acc &= (1 << this.n) - 1;
  }
  writeSigned(v, n) { this.write(v < 0 ? v + 2 ** n : v, n); }
  rice(u, k) {
    let q = Math.floor(u / 2 ** k);
    while (q >= 24) { this.write(0, 24); q -= 24; }
    this.write(1, q + 1);
    this.write(u % 2 ** k, k);
  }
  align() { if (this.n) this.write(0, 8 - this.n); }
  bytes() { return this.buf.subarray(0, this.pos); }
}

const CRC8 = (() => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; t[i] = c; } return t; })();
const CRC16 = (() => { const t = new Uint16Array(256); for (let i = 0; i < 256; i++) { let c = i << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; t[i] = c; } return t; })();
const crc8 = (b, s, e) => { let c = 0; for (let i = s; i < e; i++) c = CRC8[c ^ b[i]]; return c; };
const crc16 = (b, s, e) => { let c = 0; for (let i = s; i < e; i++) c = ((c << 8) ^ CRC16[(c >> 8) ^ b[i]]) & 0xffff; return c; };

function encodeFlacFile(chans, sr, bits, meta = {}) {
  const ch = chans.length, n = chans[0].length, full = 2 ** (bits - 1) - 1, rnd = mulberry32(99);
  // integer samples (16-bit gets TPDF dither, like the WAV encoder)
  const ints = chans.map(() => new Int32Array(n));
  for (let i = 0; i < n; i++) { // same order as the WAV encoder, so a 16-bit FLAC matches the 16-bit WAV exactly
    for (let c = 0; c < ch; c++) {
      let s = chans[c][i] * full;
      if (bits === 16) s += rnd() - rnd();
      ints[c][i] = Math.max(-full - 1, Math.min(full, Math.round(s)));
    }
  }
  const BS = 4096, w = new BitWriter(Math.max(1 << 20, n * ch * bits / 8));
  // "fLaC" + STREAMINFO + VORBIS_COMMENT
  w.write(0x664c6143, 32);
  w.write(0, 1); w.write(0, 7); w.write(34, 24);
  w.write(BS, 16); w.write(BS, 16); w.write(0, 24); w.write(0, 24);
  w.write(sr, 20); w.write(ch - 1, 3); w.write(bits - 1, 5);
  w.write(Math.floor(n / 2 ** 32), 4); w.write(n % 2 ** 32, 32);
  for (let i = 0; i < 4; i++) w.write(0, 32); // MD5 not computed (allowed)
  const comments = [['TITLE', meta.title], ['ARTIST', meta.artist], ['ALBUM', meta.album], ['DATE', meta.year], ['GENRE', meta.genre],
    ['COPYRIGHT', meta.copyright], ['ISRC', meta.isrc], ['BPM', meta.bpm], ['KEY', meta.key], ['COMMENT', meta.comment]]
    .filter(([, x]) => x).map(([k, x]) => enc.encode(`${k}=${x}`));
  const vendor = enc.encode('cs-10 Ambient Synthesizer');
  const vcLen = 4 + vendor.length + 4 + comments.reduce((a, c) => a + 4 + c.length, 0);
  w.write(1, 1); w.write(4, 7); w.write(vcLen, 24);
  const le32 = (x) => { w.write(x & 255, 8); w.write((x >>> 8) & 255, 8); w.write((x >>> 16) & 255, 8); w.write((x >>> 24) & 255, 8); };
  le32(vendor.length); for (const b of vendor) w.write(b, 8);
  le32(comments.length); for (const c of comments) { le32(c.length); for (const b of c) w.write(b, 8); }

  const srCode = { 44100: 9, 48000: 10, 96000: 11, 88200: 8 }[sr] ?? 0;
  const sizeCode = { 16: 4, 24: 6 }[bits];
  for (let f = 0, start = 0; start < n; f++, start += BS) {
    const len = Math.min(BS, n - start), frameStart = w.pos;
    w.write(0xfff8, 16);
    w.write(len === BS ? 12 : 7, 4); w.write(srCode, 4);
    w.write(ch === 2 ? 1 : 0, 4); w.write(sizeCode, 3); w.write(0, 1);
    // frame number, UTF-8 style
    if (f < 0x80) w.write(f, 8);
    else if (f < 0x800) { w.write(0xc0 | (f >> 6), 8); w.write(0x80 | (f & 63), 8); }
    else if (f < 0x10000) { w.write(0xe0 | (f >> 12), 8); w.write(0x80 | ((f >> 6) & 63), 8); w.write(0x80 | (f & 63), 8); }
    else { w.write(0xf0 | (f >> 18), 8); w.write(0x80 | ((f >> 12) & 63), 8); w.write(0x80 | ((f >> 6) & 63), 8); w.write(0x80 | (f & 63), 8); }
    if (len !== BS) w.write(len - 1, 16);
    w.write(crc8(w.buf, frameStart, w.pos), 8);
    for (let c = 0; c < ch; c++) flacSubframe(w, ints[c].subarray(start, start + len), bits);
    w.align();
    w.write(crc16(w.buf, frameStart, w.pos), 16);
  }
  return new Blob([w.bytes().slice()], { type: 'audio/flac' });
}

function flacSubframe(w, x, bits) {
  const len = x.length;
  let constant = true;
  for (let i = 1; i < len; i++) if (x[i] !== x[0]) { constant = false; break; }
  if (constant) { w.write(0, 8); w.writeSigned(x[0], bits); return; }
  // pick the fixed predictor order with the smallest residual
  const res = (p, i) => p === 0 ? x[i] : p === 1 ? x[i] - x[i - 1] : p === 2 ? x[i] - 2 * x[i - 1] + x[i - 2]
    : p === 3 ? x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3] : x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
  let best = 0, bestSum = Infinity;
  const maxOrder = Math.min(4, len - 1);
  for (let p = 0; p <= maxOrder; p++) {
    let s = 0;
    for (let i = p; i < len; i++) s += Math.abs(res(p, i));
    if (s < bestSum) { bestSum = s; best = p; }
  }
  const u = new Float64Array(len - best);
  let mean = 0;
  for (let i = best; i < len; i++) { const r = res(best, i); const z = r >= 0 ? 2 * r : -2 * r - 1; u[i - best] = z; mean += z; }
  mean /= Math.max(1, u.length);
  const bitsFor = (k) => { let b = 0; for (let i = 0; i < u.length; i++) b += Math.floor(u[i] / 2 ** k) + 1 + k; return b; };
  let k = Math.max(0, Math.min(30, Math.floor(Math.log2(mean + 1)))), kb = bitsFor(k);
  for (const kk of [k - 1, k + 1]) if (kk >= 0 && kk <= 30) { const b = bitsFor(kk); if (b < kb) { kb = b; k = kk; } }
  if (kb + best * bits > len * bits) { // prediction doesn't pay: store verbatim
    w.write(2, 8);
    for (let i = 0; i < len; i++) w.writeSigned(x[i], bits);
    return;
  }
  w.write((8 | best) << 1, 8); // FIXED, order `best`, no wasted bits
  for (let i = 0; i < best; i++) w.writeSigned(x[i], bits);
  w.write(1, 2); w.write(0, 4); // RICE2 (5-bit parameters), one partition
  w.write(k, 5);
  for (let i = 0; i < u.length; i++) w.rice(u[i], k);
}

/* MP3 (320 kbps) via the lamejs encoder, loaded only when needed, with an ID3v2.4 tag. */
async function loadLame() {
  if (window.lamejs) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('The MP3 encoder could not be loaded (it needs an internet connection).'));
    document.head.appendChild(s);
  });
}
async function encodeMp3File(chans, sr, meta = {}, onProgress) {
  await loadLame();
  const n = chans[0].length, rnd = mulberry32(5);
  const to16 = (c) => { const o = new Int16Array(n); for (let i = 0; i < n; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767 + rnd() - rnd()))); return o; };
  const L = to16(chans[0]), R = to16(chans[1] || chans[0]);
  const e = new lamejs.Mp3Encoder(2, sr, 320), parts = [id3Tag(meta)];
  const step = 1152 * 64;
  for (let i = 0; i < n; i += 1152) {
    const out = e.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
    if (out.length) parts.push(new Uint8Array(out));
    if (onProgress && i % step === 0) { onProgress(i / n); await new Promise((r) => setTimeout(r, 0)); }
  }
  const end = e.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: 'audio/mpeg' });
}
function id3Tag(meta) {
  const ss = (x) => [(x >> 21) & 127, (x >> 14) & 127, (x >> 7) & 127, x & 127]; // syncsafe
  const frames = [];
  const text = (id, x) => { if (!x) return; const b = enc.encode(String(x)); frames.push([id, new Uint8Array([3, ...b])]); }; // 3 = UTF-8
  text('TIT2', meta.title); text('TPE1', meta.artist); text('TALB', meta.album); text('TDRC', meta.year);
  text('TCON', meta.genre); text('TCOP', meta.copyright); text('TSRC', meta.isrc); text('TBPM', meta.bpm); text('TKEY', meta.key);
  text('TSSE', 'cs-10 Ambient Synthesizer');
  if (meta.comment) frames.push(['COMM', new Uint8Array([3, 101, 110, 103, 0, ...enc.encode(meta.comment)])]);
  const body = frames.reduce((a, [, d]) => a + 10 + d.length, 0);
  const out = new Uint8Array(10 + body);
  out.set([73, 68, 51, 4, 0, 0, ...ss(body)]);
  let o = 10;
  for (const [id, d] of frames) {
    for (let i = 0; i < 4; i++) out[o + i] = id.charCodeAt(i);
    out.set(ss(d.length), o + 4); out[o + 8] = 0; out[o + 9] = 0;
    out.set(d, o + 10); o += 10 + d.length;
  }
  return out;
}

async function encodeProduct(chans, sr, fmtId, meta, onProgress) {
  const f = FORMATS[formatId(fmtId)];
  if (sr !== f.sr) { chans = resample(chans, sr, f.sr); sr = f.sr; }
  if (f.ext === 'flac') return encodeFlacFile(chans, sr, f.bits, meta);
  if (f.ext === 'mp3') return encodeMp3File(chans, sr, meta, onProgress);
  return encodeWavFile(chans, sr, f.bits, meta, !!f.float);
}

/* ---------------- ZIP (stored, no compression: audio doesn't compress) ---------------- */
const CRC32 = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC32[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function makeZip(files) { // files: [{ name, blob }]
  const parts = [], central = [];
  let offset = 0;
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
    const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
    v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true); v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
    h.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); c.set(name, 46);
    parts.push(h, data); central.push(c);
    offset += h.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
