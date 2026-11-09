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

const _gridCache = new Map();
function buildGrid(rhythmId, tsId) {
  const key = rhythmId + '|' + tsId;
  if (_gridCache.has(key)) return _gridCache.get(key);
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
  const grid = { spb, steps, ts };
  _gridCache.set(key, grid);
  return grid;
}
