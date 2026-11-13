'use strict';

/* Rhythm box patterns, in the spirit of early-70s preset drum machines.
   Patterns are generated per time signature rather than stored as fixed
   grids, so every pattern works in every meter.

   n = beats per bar, strong = beats with a kick, back = backbeats (snare/rim).
   6/8 is counted as two dotted-quarter beats, each split into three. */
const TIME_SIGS = [
  { id: '4/4', n: 4, strong: [0, 2], back: [1, 3] },
  { id: '3/4', n: 3, strong: [0], back: [1, 2] },
  { id: '5/4', n: 5, strong: [0, 3], back: [2, 4] },
  { id: '6/8', n: 2, strong: [0], back: [1], compound: true },
];

// hit(ts, beat, sub, spb, add): call add(instrument, velocity) for each sound on that step.
const RHYTHMS = [
  {
    id: 'rock', name: 'Rock',
    spb: (ts) => (ts.compound ? 3 : 4),
    hit(ts, b, s, spb, add) {
      if (spb === 3 || s % 2 === 0) add('hat', s === 0 ? 0.7 : 0.45);
      if (s === 0 && ts.strong.includes(b)) add('kick', 1);
      if (spb === 4 && s === 2 && b === ts.n - 2) add('kick', 0.75);
      if (s === 0 && ts.back.includes(b)) add('snare', 0.9);
    },
  },
  {
    id: 'slowrock', name: 'Slow Rock',
    spb: () => 3,
    hit(ts, b, s, spb, add) {
      add('hat', s === 0 ? 0.6 : 0.35);
      if (s === 0 && ts.strong.includes(b)) add('kick', 1);
      if (s === 2 && b === ts.n - 1) add('kick', 0.55);
      if (s === 0 && ts.back.includes(b)) add('snare', 0.9);
    },
  },
  {
    id: 'shuffle', name: 'Shuffle',
    spb: () => 3,
    hit(ts, b, s, spb, add) {
      if (s === 0) add('hat', 0.65);
      if (s === 2) add('hat', 0.4);
      if (s === 0 && ts.strong.includes(b)) add('kick', 0.95);
      if (s === 2 && ts.strong.includes(b)) add('kick', 0.45);
      if (s === 0 && ts.back.includes(b)) add('snare', 0.85);
      if (s === 2 && b === ts.n - 1) add('snare', 0.2);
    },
  },
  {
    id: 'bossa', name: 'Bossa',
    spb: (ts) => (ts.compound ? 3 : 4),
    hit(ts, b, s, spb, add) {
      const i = b * spb + s;
      const rim = spb === 4 ? [0, 3, 6, 10, 12].includes(i % 16) : [0, 3, 5].includes(i % 6);
      if (rim) add('rim', 0.7);
      if (s === 0) add('kick', 0.8);
      if ((spb === 4 && s === 3) || (spb === 3 && s === 2)) add('kick', 0.45);
      add('shaker', s % 2 === 0 ? 0.28 : 0.18);
    },
  },
  {
    id: 'ballad', name: 'Ballad',
    spb: (ts) => (ts.compound ? 3 : 2),
    hit(ts, b, s, spb, add) {
      add('hat', s === 0 ? 0.45 : 0.28);
      if (s === 0 && ts.strong.includes(b)) add('kick', 0.8);
      if (s === 0 && ts.back.includes(b)) add('rim', 0.65);
    },
  },
  {
    id: 'pulse', name: 'Pulse',
    spb: (ts) => (ts.compound ? 3 : 4),
    hit(ts, b, s, spb, add) {
      if (s === 0) add('kick', b === 0 ? 0.6 : 0.45);
      add('shaker', spb === 4 && s === 2 ? 0.35 : 0.12);
    },
  },
];

RHYTHMS.push(
  {
    id: 'metro', name: 'Click',
    spb: (ts) => (ts.compound ? 3 : 1),
    hit(ts, b, s, spb, add) { add('metro', s > 0 ? 0.4 : b === 0 ? 1 : 0.7); },
  },
  {
    // the user's own pattern: starts as a kick on 1 and a hat on every beat, then edited
    id: 'custom', name: 'Custom',
    spb: (ts) => (ts.compound ? 3 : 4),
    hit(ts, b, s, spb, add) {
      if (s === 0) add('hat', 0.45);
      if (s === 0 && b === 0) add('kick', 1);
    },
  },
);

// Sounds in the pattern editor, top to bottom. vel = [normal, accent].
const DRUM_INSTS = [
  { id: 'kick', name: 'Kick', vel: [0.75, 1] },
  { id: 'snare', name: 'Snare', vel: [0.6, 0.9] },
  { id: 'rim', name: 'Rim', vel: [0.5, 0.75] },
  { id: 'hat', name: 'Hat', vel: [0.4, 0.7] },
  { id: 'shaker', name: 'Shaker', vel: [0.18, 0.35] },
  { id: 'metro', name: 'Click', vel: [0.7, 1] },
];

// Steps-per-beat choices in the editor (6/8 counts dotted-quarter beats).
const STEP_CHOICES = { simple: [[1, 'Beats'], [2, '8ths'], [3, 'Triplets'], [4, '16ths']], compound: [[3, '8ths'], [6, '16ths']] };

/* Edited patterns, saved in the browser: { 'rhythmId|tsId': { spb, steps: [[{ inst, vel }]] } }.
   Edits are per time signature, because a 4/4 grid doesn't fit 3/4. */
let _patternEdits = {};
function setPatternEdits(map) { _patternEdits = map || {}; _gridCache.clear(); }
const patternKey = (rhythmId, tsId) => rhythmId + '|' + tsId;

// The built-in version of a pattern, ignoring edits (for the editor's Reset).
function baseGrid(rhythmId, tsId) {
  const r = RHYTHMS.find((x) => x.id === rhythmId) || RHYTHMS[0];
  const ts = TIME_SIGS.find((x) => x.id === tsId) || TIME_SIGS[0];
  const spb = r.spb(ts);
  const steps = [];
  for (let b = 0; b < ts.n; b++) {
    for (let s = 0; s < spb; s++) {
      const list = [];
      r.hit(ts, b, s, spb, (inst, vel) => list.push({ inst, vel }));
      steps.push(list);
    }
  }
  return { spb, steps, ts };
}

const _gridCache = new Map();
function buildGrid(rhythmId, tsId) {
  const key = patternKey(rhythmId, tsId);
  if (_gridCache.has(key)) return _gridCache.get(key);
  const ts = TIME_SIGS.find((x) => x.id === tsId) || TIME_SIGS[0];
  const ed = _patternEdits[key];
  const valid = ed && ed.spb > 0 && Array.isArray(ed.steps) && ed.steps.length === ts.n * ed.spb;
  const grid = valid
    ? { spb: ed.spb, steps: ed.steps.map((l) => (Array.isArray(l) ? l.filter((h) => h && h.inst) : [])), ts }
    : baseGrid(rhythmId, tsId);
  _gridCache.set(key, grid);
  return grid;
}
