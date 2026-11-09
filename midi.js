'use strict';

/* Standard MIDI File (format 1) export.
   Track 0: tempo, time signature, name. Then one MIDI track per synth track
   (channels 1 and 2) and the drums on channel 10 with General MIDI drum notes. */

const MIDI_PPQ = 480;

// General MIDI programs (0-based) that best match each sound.
const GM_PROGRAM = {
  glass: 88,        // Pad 1 (new age)
  strings: 48,      // String Ensemble 1
  choir: 52,        // Choir Aahs
  sweep: 90,        // Pad 3 (polysynth)
  wind: 92,         // Pad 5 (bowed)
  drone: 89,        // Pad 2 (warm)
  bell: 9,          // Glockenspiel
  organ: 16,        // Drawbar Organ
  brass: 61,        // Brass Section
  lead: 80,         // Lead 1 (square)
  tapeflute: 73,    // Flute
  tapestrings: 49,  // String Ensemble 2
};

// Rhythm box sounds → General MIDI drum notes.
const GM_DRUM = { kick: 36, snare: 38, hat: 42, rim: 37, shaker: 70 };

const TS_MIDI = { '4/4': [4, 2], '3/4': [3, 2], '5/4': [5, 2], '6/8': [6, 3] };

function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function strBytes(s) { return [...new TextEncoder().encode(s)]; }

// events: [{ tick, order, bytes }] → MTrk chunk bytes
function midiTrack(events) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let last = 0;
  for (const e of events) {
    data.push(...vlq(Math.max(0, e.tick - last)), ...e.bytes);
    last = Math.max(last, e.tick);
  }
  data.push(0, 0xff, 0x2f, 0); // end of track
  const len = data.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...data];
}

const metaName = (name) => { const b = strBytes(name); return [0xff, 0x03, ...vlq(b.length), ...b]; };

// Work out the take's tempo and time signature from the drum beat markers it recorded.
function takeTiming(take, fallbackBpm, fallbackTs) {
  const beats = take.hits.filter((h) => h.beat !== undefined).sort((a, b) => a.t - b.t);
  const ts = (beats[0] && beats[0].ts) || fallbackTs;
  let beatSec = 60 / fallbackBpm;
  if (beats.length >= 2) {
    const gaps = beats.slice(1).map((b, i) => b.t - beats[i].t).sort((a, b) => a - b);
    beatSec = gaps[Math.floor(gaps.length / 2)];
  }
  // 6/8 is counted in dotted quarters; MIDI tempo is per quarter note
  const quarterSec = ts === '6/8' ? beatSec / 1.5 : beatSec;
  return { ts, quarterSec, bpm: 60 / quarterSec };
}

/* tracks: [{ name, channel, notes: [{ midi, preset, start, end }] }]
   hits:   [{ t, inst, vel }] (drum hits; markers without inst are skipped) */
function buildMidi({ tracks, hits, bpm, ts, quarterSec, title }) {
  const tick = (sec) => Math.round((sec / quarterSec) * MIDI_PPQ);
  const chunks = [];

  // tempo / meta track
  const usPerQuarter = Math.round(quarterSec * 1e6);
  const [nn, ddPow] = TS_MIDI[ts] || TS_MIDI['4/4'];
  chunks.push(midiTrack([
    { tick: 0, order: 0, bytes: metaName(title) },
    { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, nn, ddPow, ddPow === 3 ? 36 : 24, 8] },
  ]));

  for (const tr of tracks) {
    if (!tr.notes.length) continue;
    const ch = tr.channel;
    const ev = [{ tick: 0, order: 0, bytes: metaName(tr.name) }];
    // program changes whenever the sound changes within the track
    let program = -1;
    const sorted = [...tr.notes].sort((a, b) => a.start - b.start);
    for (const n of sorted) {
      const prog = GM_PROGRAM[n.preset] ?? 0;
      const t0 = tick(n.start), t1 = Math.max(t0 + 1, tick(n.end));
      if (prog !== program) {
        ev.push({ tick: t0, order: 1, bytes: [0xc0 | ch, prog] });
        program = prog;
      }
      const note = Math.max(0, Math.min(127, n.midi));
      ev.push({ tick: t0, order: 2, bytes: [0x90 | ch, note, 100] });
      ev.push({ tick: t1, order: 0, bytes: [0x80 | ch, note, 0] }); // offs sort before ons at the same tick
    }
    chunks.push(midiTrack(ev));
  }

  const drumHits = hits.filter((h) => h.inst && GM_DRUM[h.inst] !== undefined);
  if (drumHits.length) {
    const ev = [{ tick: 0, order: 0, bytes: metaName('Rhythm') }];
    for (const h of drumHits) {
      const t0 = tick(h.t), note = GM_DRUM[h.inst];
      const vel = Math.max(1, Math.min(127, Math.round((h.vel ?? 1) * 120)));
      ev.push({ tick: t0, order: 2, bytes: [0x99, note, vel] });
      ev.push({ tick: t0 + MIDI_PPQ / 8, order: 0, bytes: [0x89, note, 0] });
    }
    chunks.push(midiTrack(ev));
  }

  const n = chunks.length;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (n >> 8) & 255, n & 255, (MIDI_PPQ >> 8) & 255, MIDI_PPQ & 255];
  return new Blob([new Uint8Array([...header, ...chunks.flat()])], { type: 'audio/midi' });
}

/* ------------------------------------------------------------------
   Import: parse a Standard MIDI File into note groups, drum hits and timing.
------------------------------------------------------------------- */
const GM_PROGRAM_TO_PRESET = Object.fromEntries(Object.entries(GM_PROGRAM).map(([id, prog]) => [prog, id]));

// General MIDI drum notes → rhythm box sounds (close relatives map to the nearest sound).
const GM_DRUM_IN = {
  35: 'kick', 36: 'kick',
  37: 'rim', 39: 'rim', 75: 'rim', 76: 'rim', 77: 'rim',
  38: 'snare', 40: 'snare',
  42: 'hat', 44: 'hat', 46: 'hat', 51: 'hat', 53: 'hat',
  54: 'shaker', 69: 'shaker', 70: 'shaker', 82: 'shaker',
};

function parseMidiFile(arrayBuffer) {
  const b = new Uint8Array(arrayBuffer);
  let i = 0;
  const need = (n) => { if (i + n > b.length) throw new Error('The file ends unexpectedly.'); };
  const id = () => { need(4); return String.fromCharCode(b[i++], b[i++], b[i++], b[i++]); };
  const u16 = () => { need(2); return (b[i++] << 8) | b[i++]; };
  const u32 = () => { need(4); return ((b[i++] << 24) | (b[i++] << 16) | (b[i++] << 8) | b[i++]) >>> 0; };
  const vlqIn = () => { let v = 0, c; do { need(1); c = b[i++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80); return v; };

  if (id() !== 'MThd') throw new Error("This isn't a MIDI file.");
  const hlen = u32(), format = u16(), ntracks = u16(), division = u16();
  i += hlen - 6;
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported.');
  const ppq = division;

  const tracks = [], tempos = [];
  let ts = null;
  for (let t = 0; t < ntracks && i < b.length; t++) {
    if (id() !== 'MTrk') throw new Error('The MIDI file is damaged.');
    const len = u32();
    const end = i + len;
    let tick = 0, running = 0, name = '';
    const notes = [], programs = [], open = new Map();
    while (i < end) {
      tick += vlqIn();
      need(1);
      let st = b[i];
      if (st & 0x80) i++; else st = running;
      if (st === 0xff) {
        const type = b[i++], len = vlqIn(), data = b.subarray(i, i + len);
        i += len;
        if (type === 0x03) name = new TextDecoder().decode(data);
        if (type === 0x51 && len === 3) tempos.push({ tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
        if (type === 0x58 && len >= 2 && !ts) ts = { nn: data[0], dd: 2 ** data[1] };
        if (type === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) {
        i += vlqIn(); // sysex: skip
      } else {
        running = st;
        const hi = st & 0xf0, ch = st & 15;
        const d1 = b[i++], d2 = hi === 0xc0 || hi === 0xd0 ? 0 : b[i++];
        const key = ch * 128 + d1;
        if (hi === 0x90 && d2 > 0) {
          if (!open.has(key)) open.set(key, []);
          open.get(key).push({ ch, midi: d1, vel: d2, on: tick });
        } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
          const q = open.get(key);
          if (q && q.length) notes.push({ ...q.shift(), off: tick });
        } else if (hi === 0xc0) {
          programs.push({ ch, tick, program: d1 });
        }
      }
    }
    i = end;
    // notes still held at the end of the track end there
    for (const q of open.values()) for (const n of q) notes.push({ ...n, off: Math.max(n.on + 1, tick) });
    tracks.push({ name, notes, programs });
  }
  tempos.sort((a, c) => a.tick - c.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  return { format, ppq, tracks, tempos, ts: ts || { nn: 4, dd: 4 } };
}

// Ticks → seconds through the tempo map.
function tickToSeconds(parsed) {
  const { ppq, tempos } = parsed;
  const segs = [];
  let sec = 0;
  tempos.forEach((tm, k) => {
    segs.push({ tick: tm.tick, sec, us: tm.us });
    const next = tempos[k + 1];
    if (next) sec += ((next.tick - tm.tick) / ppq) * (tm.us / 1e6);
  });
  return (tick) => {
    let s = segs[0];
    for (const g of segs) if (g.tick <= tick) s = g; else break;
    return s.sec + ((tick - s.tick) / ppq) * (s.us / 1e6);
  };
}

/* Turn a parsed file into what CS-10 needs:
   { groups: [{ name, notes:[{midi, preset, start, end}] }], hits, bpm, ts, length }
   Instrument groups are (track, channel) pairs with notes, excluding the drum channel. */
function midiToTake(parsed, fallbackPreset) {
  const sec = tickToSeconds(parsed);
  const groups = [], hits = [];
  parsed.tracks.forEach((tr, ti) => {
    const byCh = new Map();
    for (const n of tr.notes) {
      if (n.ch === 9) {
        const inst = GM_DRUM_IN[n.midi];
        if (inst) hits.push({ t: sec(n.on), inst, vel: Math.min(1, n.vel / 120) });
        continue;
      }
      if (!byCh.has(n.ch)) byCh.set(n.ch, []);
      byCh.get(n.ch).push(n);
    }
    for (const [ch, list] of byCh) {
      list.sort((a, c) => a.on - c.on);
      const progs = tr.programs.filter((p) => p.ch === ch).sort((a, c) => a.tick - c.tick);
      const presetAt = (tick) => {
        let prog = null;
        for (const p of progs) if (p.tick <= tick) prog = p.program; else break;
        return (prog !== null && GM_PROGRAM_TO_PRESET[prog]) || fallbackPreset;
      };
      groups.push({
        name: tr.name || `Track ${ti} · ch ${ch + 1}`,
        notes: list.map((n) => ({ midi: n.midi, preset: presetAt(n.on), start: sec(n.on), end: Math.max(sec(n.on) + 0.03, sec(n.off)) })),
      });
    }
  });
  const quarterSec = parsed.tempos[0].us / 1e6;
  const tsId = `${parsed.ts.nn}/${parsed.ts.dd}`;
  return { groups, hits, quarterSec, tsId };
}
