(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Computer keys that play notes: A–G, plus W = E♭/D♯ and V = B♭/A♯.
  // (+/− apply to the base letter: E♭ for W, B♭ for V.)
  const NOTE_KEYS = Object.fromEntries([
    ...Object.entries(NOTE_PC).map(([L, pc]) => ['Key' + L, { pc, letter: L, name: L }]),
    ['KeyW', { pc: 3, letter: 'E♭', name: 'E♭' }],
    ['KeyV', { pc: 10, letter: 'B♭', name: 'B♭' }],
  ]);
  const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK = [{ after: 0, pc: 1, name: 'C♯', flat: 'D♭' }, { after: 1, pc: 3, name: 'D♯', flat: 'E♭' },
                 { after: 3, pc: 6, name: 'F♯', flat: 'G♭' }, { after: 4, pc: 8, name: 'G♯', flat: 'A♭' },
                 { after: 5, pc: 10, name: 'A♯', flat: 'B♭' }];

  const state = {
    preset: PRESETS[0],
    octave: 4,
    sharp: false,
    flat: false,
    sustain: false,
    loop: false,
    rhythm: 'rock',
    ts: '4/4',
    countIn: true,
    quant: 0,              // index into QUANT
    mute: [false, false, false],  // Track 1, Track 2, Rhythm
    armed: null,           // track selected for recording (0, 1 or null)
    autoArmed: false,      // true when Rec picked the track itself; cleared after recording
    settings: { tone: 1, attack: 1, release: 1, echo: 0.3, space: 0.55, volume: 0.5, bpm: 92, drums: 0.7, drumFxBypass: true, vol1: 0.5, vol2: 0.5, vol3: 0.5, pan1: 0, pan2: 0, pan3: 0, vintageEq: false, tapeSat: false, echoSync: false, fxOff: false, ts: '4/4' },
  };

  let ctx = null, eng = null;
  const held = new Map();   // key/pointer id -> { voice, midi, presetId, recNote }
  let sustained = [];       // entries whose key is up but the pedal is down
  // While recording: { mode: 'main' | 'dub', t0, notes, hits, live }. t0 is in the future during count-in.
  let rec = null;
  // tracks[0] = main, tracks[1] = overdub/lead (or null). Notes: { midi, preset, start, end, start0, end0 }
  // where start0/end0 are the times as played (start/end may be quantized).
  // hits: drum hits { t, inst, vel } plus silent beat markers { t, inst: null, beat, spb }.
  let take = null;          // { tracks: [notes, notes|null], hits, length }
  let playing = null;       // { T, next, voices, dub }

  // Quantize settings: divisions per beat for straight and triplet-feel rhythms.
  const QUANT = [
    { label: 'Off' },
    { label: '1/16', straight: 4, triplet: 6 },
    { label: '1/8', straight: 2, triplet: 3 },
  ];
  let exporting = false;

  // Drum scheduling
  let drumTrack = null;     // live rhythm box: { step, nextTime, lastBar }
  let queues = [];          // timed drum events: { ev, i, tag }
  let flashes = [];         // beat lamp: { t, accent }
  const AHEAD = 0.15;

  const bpm = () => Math.round(state.settings.bpm);
  const grid = () => buildGrid(state.rhythm, state.ts);
  const beatDur = () => 60 / bpm();
  const barDur = () => grid().ts.n * beatDur();

  /* ---------------- audio ---------------- */
  function ensureAudio() {
    if (!ctx) {
      // iOS 17+: play as media so the silent switch doesn't mute the app
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      eng = new Engine(ctx, state.settings);
      $('#powerLed').classList.add('on');
      setStatus('Ready');
      setInterval(scheduleDrums, 25);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  const recording = (now) => rec && now >= rec.t0;

  // The audio-clock time the player was *hearing* when an input event happened.
  // Players play along with what comes out of the speakers, which is behind
  // ctx.currentTime by the output latency, so recorded notes use this time; otherwise
  // they'd land late against the drums and the other tracks.
  function heardTime(ev) {
    const now = ctx.currentTime;
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    if (ev && ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) {
        const t = ts.contextTime + (ev.timeStamp - ts.performanceTime) / 1000;
        if (t <= now + 0.01 && t > now - 0.5) return t; // sanity check
      }
    }
    return now - latency;
  }

  function noteDown(id, midi, name, ev, vel = DEFAULT_VEL) {
    ensureAudio();
    if (held.has(id)) {
      // computer keys auto-repeat: ignore. MIDI: the note-off was lost, so end it and play again.
      if (!id.startsWith('midi')) return;
      noteUp(id, ev);
    }
    const now = ctx.currentTime;
    // live notes play through the volume of the track they'd be recorded into
    const voice = eng.noteOn(state.preset, midi, now, monitorTrack(), { vel, live: true });
    let recNote = null;
    const heard = heardTime(ev);
    if (rec && heard >= rec.t0 - 0.05 && rec.track !== RHYTHM) {
      recNote = { midi, vel, preset: state.preset.id, start: Math.max(0, heard - rec.t0), end: null };
      rec.notes.push(recNote);
    }
    held.set(id, { voice, midi, presetId: state.preset.id, recNote });
    $('#rNote').textContent = name;
  }

  function noteUp(id, ev) {
    const e = held.get(id);
    if (!e) return;
    held.delete(id);
    if (state.sustain) sustained.push(e);
    else releaseEntry(e, ev);
  }

  function releaseEntry(e, ev) {
    e.voice.release(ctx.currentTime);
    if (e.recNote && e.recNote.end === null && rec) {
      e.recNote.end = Math.max(e.recNote.start + 0.02, heardTime(ev) - rec.t0);
    }
  }

  function setSustain(on, ev) {
    state.sustain = on;
    $('#modSus').classList.toggle('on', on);
    $('#modSus').setAttribute('aria-pressed', String(on));
    if (!on) { sustained.forEach((x) => releaseEntry(x, ev)); sustained = []; }
  }

  function releaseAll() {
    releaseChords(true); // latched chords keep playing when the window loses focus
    for (const id of [...held.keys()]) noteUp(id);
    setSustain(false);
    state.sharp = state.flat = false;
    updateMods();
  }

  /* ---------------- rhythm box ---------------- */
  // Drum hits already handed to the audio engine (up to AHEAD seconds early),
  // kept so Stop can silence the ones that haven't sounded yet.
  let pendingHits = [];
  function playHit(inst, t, vel, tag) {
    pendingHits.push({ t, tag, gains: eng.drum(inst, t, vel) });
  }
  function silencePending(tag) {
    if (!ctx) return;
    const now = ctx.currentTime;
    pendingHits = pendingHits.filter((h) => {
      if (h.tag === tag && h.t > now) {
        h.gains.forEach((g) => { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(0, now); });
        return false;
      }
      return h.t > now - 1;
    });
  }

  // Runs every 25 ms (not on the screen refresh, which pauses in background tabs):
  // keeps loops and overdubs on time and feeds notes and drums to the engine just ahead of time.
  function scheduleDrums() {
    if (!ctx) return;
    const now = ctx.currentTime, horizon = now + AHEAD;
    updatePlayback(now);
    scheduleArp(now, horizon);

    if (drumTrack) {
      // if the tab was asleep, skip ahead instead of firing a burst of hits
      if (drumTrack.nextTime < now - 0.2) drumTrack.nextTime = now + 0.05;
      while (drumTrack && drumTrack.nextTime < horizon) playStep(drumTrack);
    }

    for (const q of queues) {
      while (q.i < q.ev.length && q.ev[q.i].t < horizon) {
        const e = q.ev[q.i++];
        if (e.note) {
          if (playing) {
            const n = e.note;
            const v = eng.noteOn(presetById(n.preset), n.midi, e.t, n.track, { vel: n.vel });
            v.release(e.t + (n.end - n.start));
            playing.voices.push(v);
          }
          continue;
        }
        if (e.inst) playHit(e.inst, e.t, e.vel, q.tag);
        if (e.beat !== undefined) flashes.push({ t: e.t, accent: e.beat === 0 });
      }
    }
    queues = queues.filter((q) => q.i < q.ev.length);
  }

  function playStep(tr) {
    const g = grid(), len = g.steps.length;
    const s = tr.step % len, t = tr.nextTime;
    const isBeat = s % g.spb === 0;
    const capture = recording(t);
    for (const h of g.steps[s]) {
      playHit(h.inst, t, h.vel, 'live');
      if (capture) rec.hits.push({ t: t - rec.t0, inst: h.inst, vel: h.vel });
    }
    if (isBeat) {
      flashes.push({ t, accent: s === 0 });
      // silent marker so the take keeps its bar lines and beat lamp
      if (capture) rec.hits.push({ t: t - rec.t0, inst: null, beat: s === 0 ? 0 : 1, spb: g.spb, ts: state.ts });
    }
    if (s === 0) tr.lastBar = t;
    tr.step++;
    tr.nextTime += beatDur() / g.spb;
  }

  function startDrums(at) {
    ensureAudio();
    drumTrack = { step: 0, nextTime: at ?? ctx.currentTime + 0.05, lastBar: null };
    keepAwake(true);
    refreshButtons();
  }

  function stopDrums() {
    drumTrack = null;
    silencePending('live');
    keepAwake(false);
    refreshButtons();
  }

  // Phones: stop the screen sleeping (which would stop the drums) while the rhythm runs.
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* not supported or not allowed: drums still work */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && drumTrack) keepAwake(true);
  });

  function toggleDrums() {
    ensureAudio();
    if (drumTrack) stopDrums();
    else {
      if (playing && hasDrums(take)) stopPlayback();
      startDrums();
    }
  }

  // Keep the current position in the bar when the pattern or meter changes.
  function changeGrid(fn) {
    const old = grid();
    fn();
    state.settings.ts = state.ts; // the synced echo follows the meter
    if (eng) eng.applyMix();
    const l = $('#echoTimeLbl'); if (l) l.textContent = `${Math.round(echoTime(state.settings) * 1000)} ms`;
    const g = grid();
    if (drumTrack) {
      const posBeats = (drumTrack.step % old.steps.length) / old.spb;
      drumTrack.step = Math.round(posBeats * g.spb) % g.steps.length;
    }
    refreshRhythm();
  }

  const hasDrums = (tk) => !!tk && tk.hits.some((h) => h.inst);
  const RHYTHM = 2; // track index of the drums
  const trackName = (i) => (i === RHYTHM ? 'Rhythm' : `Track ${i + 1}`);

  /* ---------------- recording & playback ---------------- */
  // Rec records into the selected track. With nothing recorded yet it is always
  // track 1; if track 1 has notes and no track is selected, it picks track 2.
  function startRecording() {
    ensureAudio();
    const track1 = !!take && take.tracks[0] && take.tracks[0].length > 0;
    let target = state.armed;
    let auto = false;
    if (!take) { if (target !== RHYTHM) { auto = target !== 0; target = 0; } }
    else if (target === null) { target = track1 ? 1 : 0; auto = true; }
    state.armed = target;
    state.autoArmed = auto;
    if (take) startDub(target);
    else startTake(target);
  }

  function endRecording() {
    if (state.autoArmed) { state.armed = null; state.autoArmed = false; }
  }

  // First recording: Track 1 (plus the Rhythm track if the drums are running),
  // or just the Rhythm track when it's armed. Free length.
  function startTake(track = 0) {
    stopPlayback();
    const now = ctx.currentTime;
    const drumsOnly = track === RHYTHM;

    if (state.countIn) {
      let t0;
      if (drumTrack) {
        // the running rhythm counts you in: start on the next downbeat at least half a bar away
        const g = grid(), stepDur = beatDur() / g.spb;
        const stepsToBar = (g.steps.length - (drumTrack.step % g.steps.length)) % g.steps.length;
        t0 = drumTrack.nextTime + stepsToBar * stepDur;
        if (t0 - now < barDur() * 0.5) t0 += barDur();
      } else {
        // one bar of clicks
        const g = grid(), start = now + 0.1;
        const clicksPerBeat = g.ts.compound ? 3 : 1;
        const n = g.ts.n * clicksPerBeat, step = beatDur() / clicksPerBeat;
        const ev = [];
        for (let k = 0; k < n; k++) {
          const beat = k % clicksPerBeat === 0;
          ev.push({ t: start + k * step, inst: 'click', vel: k === 0 ? 1 : beat ? 0.8 : 0.5, beat: beat ? (k === 0 ? 0 : 1) : undefined });
        }
        queues.push({ ev, i: 0, tag: 'count' });
        t0 = start + n * step;
      }
      rec = { mode: 'main', track, t0, notes: [], hits: [], live: false, countIn: true };
      if (drumsOnly && !drumTrack) startDrums(t0);
    } else {
      rec = { mode: 'main', track, t0: now, notes: [], hits: [], live: true };
      if (drumsOnly && !drumTrack) startDrums(now + 0.02);
      // notes already held become part of the take from time 0
      for (const e of drumsOnly ? [] : held.values()) {
        e.recNote = { midi: e.midi, preset: e.presetId, start: 0, end: null };
        rec.notes.push(e.recNote);
      }
      setStatus(`Recording · ${trackName(track)}`, 'rec');
    }
    refreshButtons();
  }

  function stopRecording() {
    if (!rec) return;
    const now = ctx.currentTime;
    if (rec.mode === 'dub') { finishDub(true); return; }

    if (now < rec.t0) { // stopped during the count-in
      queues = queues.filter((q) => q.tag !== 'count');
      silencePending('count');
      rec = null;
      endRecording();
      setStatus(takeLabel());
      refreshButtons();
      return;
    }

    let length = now - rec.t0;
    const { notes } = rec;
    let hits = rec.hits;

    // With drums, end the take on a bar line so it loops in time.
    if (hits.some((h) => h.inst) && drumTrack && drumTrack.lastBar !== null) {
      const bar = barDur();
      let b = drumTrack.lastBar;
      while (b > now) b -= bar;
      let end = now - b < bar * 0.3 ? b : b + bar;
      if (end <= rec.t0 + 0.05) end = b + bar;
      length = end - rec.t0;
    }
    notes.forEach((n) => { if (n.end === null) n.end = now - rec.t0; });
    hits = hits.filter((h) => h.t < length - 0.001);
    rec = null;
    endRecording();

    if (!notes.length && !hits.some((h) => h.inst)) {
      setStatus('Nothing recorded');
      refreshButtons();
      return;
    }

    // Trim leading silence: to the first downbeat if there are drums, else to just before the first note.
    const firstNote = notes.length ? Math.min(...notes.map((n) => n.start)) : Infinity;
    let shift = 0;
    if (hits.some((h) => h.inst)) {
      // the bar the first note falls in, or the first bar if there are no notes (drums only)
      const down = notes.length
        ? hits.filter((h) => h.beat === 0 && h.t <= firstNote + 0.05).pop()
        : hits.find((h) => h.beat === 0);
      if (down) shift = down.t;
    } else {
      shift = Math.max(0, firstNote - 0.2);
    }
    notes.forEach((n) => { n.start = Math.max(0, n.start - shift); n.end = Math.max(n.start + 0.02, n.end - shift); });
    hits = hits.filter((h) => h.t >= shift - 0.001).map((h) => ({ ...h, t: Math.max(0, h.t - shift) }));
    length -= shift;
    if (!hits.length) length = Math.max(length, ...notes.map((n) => n.end));

    notes.forEach((n) => { n.start0 = n.start; n.end0 = n.end; });
    saveUndo('recording');
    take = { tracks: [notes, null], hits, length };
    state.mute = [false, false, false];
    // like a DAW moving on to the next empty track
    state.armed = notes.length ? 1 : 0;
    state.autoArmed = false;
    applyQuantize();
    setStatus(takeLabel());
    refreshButtons();
  }

  /* Record one track over an existing take, while the other track and the drums play back.
     The new notes replace that track. */
  function startDub(track) {
    if (!take) return;
    stopPlayback();
    stopDrums();
    let T = ctx.currentTime + 0.1;

    if (state.countIn) {
      // one bar of clicks at the take's own tempo (or the current tempo if it has no drums)
      const beats = take.hits.filter((h) => h.beat !== undefined);
      const downs = beats.filter((h) => h.beat === 0);
      let offsets, bar;
      if (downs.length >= 2) {
        bar = downs[1].t - downs[0].t;
        offsets = beats.filter((h) => h.t >= downs[0].t && h.t < downs[1].t - 0.001).map((h) => h.t - downs[0].t);
      } else {
        const n = grid().ts.n;
        bar = n * beatDur();
        offsets = [...Array(n)].map((_, k) => k * beatDur());
      }
      const ev = offsets.map((o, k) => ({ t: T + o, inst: 'click', vel: k === 0 ? 1 : 0.8, beat: k === 0 ? 0 : 1 }));
      queues.push({ ev, i: 0, tag: 'count' });
      T += bar;
    }

    playing = { T, next: null, voices: [], dub: true, skip: track };
    schedulePass(T, track);
    rec = { mode: 'dub', track, t0: T, notes: [], hits: [], live: false, countIn: state.countIn };
    if (track === RHYTHM) startDrums(T); // the rhythm box plays (and is captured) from the top of the take
    if (!state.countIn) { rec.live = true; setStatus(`Recording · ${trackName(track)}`, 'rec'); }
    refreshButtons();
  }

  function finishDub(cut) {
    const now = ctx.currentTime;
    const r = rec;
    rec = null;
    endRecording();
    queues = queues.filter((q) => q.tag !== 'count');
    if (r.track === RHYTHM) {
      stopDrums();
      const hits = r.hits.filter((h) => h.t < take.length - 0.001);
      if (now >= r.t0 && hits.some((h) => h.inst)) {
        saveUndo('recording');
        take.hits = hits;
        state.mute[RHYTHM] = false;
        applyQuantize();
      }
    } else if (now >= r.t0) {
      const notes = r.notes.filter((n) => n.start < take.length);
      notes.forEach((n) => {
        if (n.end === null) n.end = Math.min(now - r.t0, take.length);
        n.start0 = n.start; n.end0 = n.end;
      });
      if (notes.length) {
        saveUndo('recording');
        take.tracks[r.track] = notes;
        state.mute[r.track] = false;
        applyQuantize();
      }
    }
    if (cut) stopPlayback();
    else playing = null; // reached the end: let tails ring out
    setStatus(takeLabel());
    refreshButtons();
  }

  /* ---------------- quantize ---------------- */
  // Grid points between the take's recorded beat markers.
  function quantGrid(q) {
    const beats = take.hits.filter((h) => h.beat !== undefined);
    if (beats.length < 2 || !q.straight) return null;
    const pts = [];
    beats.forEach((b, i) => {
      const next = i + 1 < beats.length ? beats[i + 1].t : b.t + (b.t - beats[i - 1].t);
      const div = b.spb === 3 ? q.triplet : q.straight;
      for (let k = 0; k < div; k++) pts.push(b.t + ((next - b.t) * k) / div);
    });
    pts.push(take.length);
    return pts;
  }

  const canQuantize = () => !!take && take.hits.filter((h) => h.beat !== undefined).length >= 2;

  function applyQuantize() {
    if (!take) return;
    const pts = canQuantize() ? quantGrid(QUANT[state.quant]) : null;
    for (const notes of take.tracks) {
      if (!notes) continue;
      for (const n of notes) {
        if (!pts) { n.start = n.start0; n.end = n.end0; continue; }
        let q = pts[0];
        for (const p of pts) if (Math.abs(p - n.start0) < Math.abs(q - n.start0)) q = p;
        if (q >= take.length - 0.001) q = 0; // a note pushed to the loop point belongs on beat 1
        n.start = q;
        n.end = q + Math.max(0.05, n.end0 - n.start0);
      }
    }
  }

  function cycleQuant() {
    if (!canQuantize()) return;
    state.quant = (state.quant + 1) % QUANT.length;
    applyQuantize();
    refreshButtons();
  }

  /* ---------------- tracks ---------------- */
  // Notes that should sound: every unmuted track (optionally skipping one).
  function audibleNotes(skip) {
    if (!take) return [];
    return take.tracks.flatMap((t, i) => (t && i !== skip && !state.mute[i] ? t.map((n) => ({ ...n, track: i })) : []));
  }

  // The track Rec would record into right now (for monitoring live playing).
  function monitorTrack() {
    if (rec) return rec.track;
    if (state.armed !== null) return state.armed;
    if (!take) return 0;
    return take.tracks[0] && take.tracks[0].length ? 1 : 0;
  }

  function toggleMute(i) {
    if (!take || (i === RHYTHM ? !hasDrums(take) : !take.tracks[i])) return;
    state.mute[i] = !state.mute[i];
    refreshButtons();
  }

  function clearTracks() {
    if (!take) return;
    if (!window.confirm('Are you sure you want to clear all tracks?')) return;
    if (rec) { queues = queues.filter((q) => q.tag !== 'count'); rec = null; }
    stopPlayback();
    saveUndo('clear');
    take = null;
    state.mute = [false, false, false];
    state.armed = null;
    state.autoArmed = false;
    setStatus('Tracks cleared');
    refreshButtons();
  }

  /* ---------------- undo (one step) ---------------- */
  let undoSnap = null;
  function saveUndo(what) {
    undoSnap = { what, take: take ? structuredClone(take) : null, mute: [...state.mute] };
  }
  function undo() {
    if (!undoSnap || rec) return;
    stopPlayback();
    const s = undoSnap;
    undoSnap = null;
    take = s.take;
    state.mute = s.mute;
    applyQuantize();
    setStatus(s.what === 'recording' ? 'Recording undone' : 'Clear undone');
    refreshButtons();
  }
  // a take only lives in this tab: warn before it's lost
  window.addEventListener('beforeunload', (e) => {
    if (take) { e.preventDefault(); e.returnValue = ''; }
  });

  // Clear one track's notes; the other track and the recorded drums stay.
  function clearTrack(i) {
    if (!take || rec) return;
    const has = i === RHYTHM ? hasDrums(take) : take.tracks[i] && take.tracks[i].length;
    if (!has) return;
    if (!window.confirm(`Are you sure you want to clear ${i === RHYTHM ? 'the Rhythm track' : trackName(i)}?`)) return;
    stopPlayback();
    saveUndo(`clear of ${trackName(i)}`);
    if (i === RHYTHM) take.hits = take.hits.filter((h) => !h.inst); // keep the beat grid for Quantize
    else take.tracks[i] = i === 0 ? [] : null;
    state.mute[i] = false;
    // nothing left at all (no notes on either track, no drums): no take
    if (!take.tracks.some((t) => t && t.length) && !hasDrums(take)) take = null;
    setStatus(`${trackName(i)} cleared`);
    refreshButtons();
  }

  function selectTrack(i) {
    if (rec) return;
    state.armed = state.armed === i ? null : i;
    state.autoArmed = false;
    refreshButtons();
  }

  function takeLabel() {
    if (!take) return 'Ready';
    const parts = [`${take.tracks[0].length} notes`];
    if (take.tracks[1]) parts.push(`${take.tracks[1].length} lead`);
    if (hasDrums(take)) parts.push('drums');
    return `Take: ${parts.join(' + ')} · ${fmtTime(take.length)}`;
  }

  // Queue one pass of the take. Notes and drums are handed to the engine just before
  // they play (see scheduleDrums), so long takes don't create every voice at once.
  function schedulePass(T, skip) {
    const ev = audibleNotes(skip).map((n) => ({ t: T + n.start, note: n }));
    const hits = skip === RHYTHM ? [] : take.hits.filter((h) => !h.inst || !state.mute[RHYTHM]);
    for (const h of hits) ev.push({ ...h, t: T + h.t });
    ev.sort((a, b) => a.t - b.t);
    if (ev.length) queues.push({ ev, i: 0, tag: 'play' });
  }

  function startPlayback() {
    ensureAudio();
    if (rec) stopRecording();
    if (!take) return;
    stopPlayback();
    if (hasDrums(take)) stopDrums();
    playing = { T: ctx.currentTime + 0.06, next: null, voices: [] };
    schedulePass(playing.T);
    setStatus('Playing');
    refreshButtons();
  }

  function stopPlayback() {
    if (!playing) return;
    const t = ctx.currentTime;
    playing.voices.forEach((v) => { if (!v.done) v.kill(t); });
    queues = queues.filter((q) => q.tag !== 'play');
    silencePending('play');
    playing = null;
    setStatus(takeLabel());
    refreshButtons();
  }

  function stopAll() {
    if (rec) stopRecording();
    stopPlayback();
    stopDrums();
    releaseChords();
  }

  function updatePlayback(now) {
    if (!playing) return;
    if (playing.next !== null && now >= playing.next) { playing.T = playing.next; playing.next = null; }
    const end = playing.T + take.length;
    if (playing.dub) {
      if (now >= end) finishDub(false);
      return;
    }
    if (state.loop) {
      if (playing.next === null && now > end - 0.5) { playing.next = end; schedulePass(end); }
    } else if (now >= end) {
      // let the release tails ring out naturally
      playing = null;
      setStatus(takeLabel());
      refreshButtons();
      return;
    }
    if (playing.voices.length > 200) playing.voices = playing.voices.filter((v) => !v.done);
  }

  // Audio export runs behind a progress window, so nothing gets changed mid-render.
  let exportJob = null; // { cancelled }
  async function exportTake() {
    if (!take || exporting) return;
    if (rec) stopRecording();
    exporting = true;
    refreshButtons();
    const job = (exportJob = { cancelled: false });
    const name = takeFileName('wav');
    try {
      const target = await exportTarget(name, 'wav'); // before rendering, while the click still allows a dialog
      if (!target) { setStatus('Export cancelled'); return; }
      showRender(target.file ? target.file.name : name);
      setStatus('Rendering WAV…');
      const hits = state.mute[RHYTHM] ? [] : take.hits;
      const format = prefs.exportFormat === '16' ? { sampleRate: 44100, bits: 16 } : { sampleRate: 48000, bits: 24 };
      const blob = await renderTakeToWav({ notes: audibleNotes(), hits, length: take.length }, state.settings, format,
        (f, step, detail) => { if (!job.cancelled) updateRender(f, detail); });
      if (job.cancelled) return;
      updateRender(1, 'Saving…');
      await saveExport(blob, name, target);
      updateRender(1, 'Done');
      setTimeout(hideRender, 450);
    } catch (err) {
      console.error(err);
      setStatus('Export failed');
      if (!job.cancelled) { updateRender(0, 'Export failed. Please try again.'); renderFailed(); }
    } finally {
      if (exportJob === job) { exporting = false; exportJob = null; refreshButtons(); }
    }
  }

  const renderDlg = $('#renderDlg');
  renderDlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc can't close it mid-render
  function showRender(name) {
    $('#renderFile').textContent = name;
    $('#renderCancel').textContent = 'Cancel';
    renderDlg.classList.remove('failed');
    updateRender(0, 'Preparing…');
    if (!renderDlg.open) renderDlg.showModal();
  }
  function updateRender(f, detail) {
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    $('#renderFill').style.width = pct + '%';
    $('#renderPct').textContent = pct + '%';
    $('#renderBar').setAttribute('aria-valuenow', String(pct));
    if (detail) $('#renderStep').textContent = detail;
  }
  function renderFailed() {
    renderDlg.classList.add('failed');
    $('#renderCancel').textContent = 'Close';
  }
  function hideRender() { if (renderDlg.open) renderDlg.close(); }
  click('#renderCancel', () => {
    if (exportJob && !renderDlg.classList.contains('failed')) {
      exportJob.cancelled = true; // the render finishes in the background and is discarded
      exporting = false;
      exportJob = null;
      setStatus('Export cancelled');
      refreshButtons();
    }
    hideRender();
  });

  const safeName = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

  // Default export name: <prefix>-YYYYMMDD-HHMM (prefix from Settings).
  function defaultTakeName() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const prefix = safeName(prefs.filePrefix) || PREF_DEFAULTS.filePrefix;
    return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // The take's own name if it has been renamed, otherwise the default.
  const takeName = () => (take && safeName(take.name)) || defaultTakeName();
  const takeFileName = (ext) => `${takeName()}.${ext}`;

  // The name tag in the header is edited in place (it's the export file name).
  const nameField = $('#takeNameText');
  let nameBefore = '';
  nameField.addEventListener('focus', () => {
    if (!take || rec) { nameField.blur(); return; }
    nameBefore = nameField.textContent;
    const r = document.createRange(); // select the whole name so typing replaces it
    r.selectNodeContents(nameField);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  nameField.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing a name never plays notes or triggers shortcuts
    if (e.key === 'Enter') { e.preventDefault(); nameField.blur(); }
    else if (e.key === 'Escape') { nameField.textContent = nameBefore; nameField.blur(); }
  });
  nameField.addEventListener('keyup', (e) => e.stopPropagation());
  nameField.addEventListener('paste', (e) => { // plain text only
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
  });
  nameField.addEventListener('input', () => {
    if (nameField.textContent.length > 60) nameField.textContent = nameField.textContent.slice(0, 60);
  });
  nameField.addEventListener('blur', () => {
    if (!take) return;
    const typed = safeName(nameField.textContent);
    if (!typed) take.name = null;                                            // emptied: back to the default
    else if (!take.name && typed === safeName(nameBefore)) take.name = null; // default left untouched
    else take.name = typed;
    window.getSelection().removeAllRanges();
    refreshButtons();
  });

  // Save into the chosen export folder if there is one, otherwise a normal download.
  // Decide where an export goes, straight from the click (dialogs and permission prompts
  // need that). Returns { file } | { dir } | {} (Downloads), or null if the Save dialog was cancelled.
  async function exportTarget(name, kind) {
    if (prefs.promptSave && canSaveAs) {
      const file = await pickSaveFile(name, kind);
      return file ? { file } : null;
    }
    return { dir: await writableExportDir() };
  }

  async function saveExport(blob, name, target = {}) {
    if (target.file) {
      await writeToHandle(target.file, blob);
      setStatus(`Saved ${target.file.name}`);
      return;
    }
    const dir = target.dir;
    if (dir) {
      try {
        await writeToDir(dir, name, blob);
        setStatus(`Saved ${name} to “${dir.name}”`);
        return;
      } catch (err) {
        console.warn('Saving to the export folder failed; downloading instead.', err);
      }
    }
    download(blob, name);
    setStatus(`Exported ${name}`);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // MIDI: both tracks (unless muted) plus the drums, at the take's tempo and meter.
  async function exportMidi() {
    if (!take) return;
    if (rec) stopRecording();
    try {
      const name = takeFileName('mid');
      const target = await exportTarget(name, 'mid');
      if (!target) { setStatus('Export cancelled'); return; }
      const timing = takeTiming(take, bpm(), state.ts);
      const tracks = [0, 1].map((i) => ({
        name: `Track ${i + 1}`,
        channel: i,
        notes: take.tracks[i] && !state.mute[i] ? take.tracks[i] : [],
      }));
      const blob = buildMidi({ tracks, hits: state.mute[RHYTHM] ? [] : take.hits, ...timing, title: 'cs-10 take' });
      await saveExport(blob, name, target);
    } catch (err) {
      console.error(err);
      setStatus('MIDI export failed');
    }
  }

  /* MIDI import: up to 2 instrument tracks (drums on channel 10 come in as the rhythm). */
  async function importMidiFile(file) {
    if (!file || rec) return;
    let parsed, conv;
    try {
      parsed = parseMidiFile(await file.arrayBuffer());
      conv = midiToTake(parsed, state.preset.id);
    } catch (err) {
      window.alert(`Couldn't import "${file.name}": ${err.message}`);
      return;
    }
    const { groups, hits, quarterSec } = conv;
    if (groups.length > 2) {
      window.alert(`"${file.name}" has ${groups.length} instrument tracks. CS-10 can import up to 2 (drums on channel 10 don't count).`);
      return;
    }
    if (!groups.length && !hits.length) {
      window.alert(`"${file.name}" has no notes to import.`);
      return;
    }
    if (take && !window.confirm('Importing will replace the current take. Continue?')) return;
    stopPlayback();
    stopDrums();

    // Timing: use the file's tempo and meter, and lay down a beat grid so Quantize and overdubs line up.
    const tsKnown = TIME_SIGS.some((t) => t.id === conv.tsId);
    const ts = tsKnown ? conv.tsId : '4/4';
    const tsInfo = TIME_SIGS.find((t) => t.id === ts);
    const beatSec = ts === '6/8' ? quarterSec * 1.5 : quarterSec;
    const spb = ts === '6/8' ? 3 : 4;
    const bar = tsInfo.n * beatSec;
    const last = Math.max(0, ...groups.flatMap((g) => g.notes.map((n) => n.end)), ...hits.map((h) => h.t + 0.05));
    const length = Math.max(1, Math.ceil(last / bar - 0.02)) * bar;
    const markers = [];
    for (let k = 0; k * beatSec < length - 1e-6; k++) {
      markers.push({ t: k * beatSec, inst: null, beat: k % tsInfo.n === 0 ? 0 : 1, spb, ts });
    }

    saveUndo('import');
    const tracks = groups.map((g) => g.notes.map((n) => ({ ...n, start0: n.start, end0: n.end })));
    take = {
      name: safeName(file.name.replace(/\.midi?$/i, '')) || null,
      tracks: [tracks[0] || [], tracks[1] || null],
      hits: [...hits, ...markers].sort((x, y) => x.t - y.t),
      length,
    };
    state.mute = [false, false, false];
    state.armed = null;
    state.autoArmed = false;
    tempoKnob.setValue(60 / beatSec);
    changeGrid(() => (state.ts = ts));
    applyQuantize();
    const extra = tsKnown ? '' : ` (meter ${conv.tsId} shown as 4/4)`;
    setStatus(`Imported ${file.name}${extra}`);
    refreshButtons();
  }

  /* ---------------- chords + arpeggiator ---------------- */
  // Chord pads: chord types across the 12 roots, ordered round the circle of fifths.
  const CHORD_ROOTS = [['C', 0], ['G', 7], ['D', 2], ['A', 9], ['E', 4], ['B', 11], ['F♯', 6], ['D♭', 1], ['A♭', 8], ['E♭', 3], ['B♭', 10], ['F', 5]];
  const CHORD_TYPES = [
    { label: 'Maj', suffix: '', iv: [0, 4, 7] },
    { label: 'Min', suffix: 'm', iv: [0, 3, 7] },
    { label: '7', suffix: '7', iv: [0, 4, 7, 10] },
    { label: 'Maj7', suffix: 'maj7', iv: [0, 4, 7, 11] },
    { label: 'Min7', suffix: 'm7', iv: [0, 3, 7, 10] },
    { label: 'Sus2', suffix: 'sus2', iv: [0, 2, 7] },
    { label: 'Dim7', suffix: 'dim7', iv: [0, 3, 6, 9] },
    { label: 'Aug7', suffix: 'aug7', iv: [0, 4, 8, 10] },
  ];
  const isPhone = () => window.matchMedia('(max-width: 600px)').matches;

  // Voice the chord around the current octave (roots from F♯ up start an octave lower).
  function chordNotes(pc, iv) {
    let root = 12 * (octave() + 1) + pc;
    if (pc >= 6) root -= 12;
    return iv.map((i) => root + i);
  }

  const chordHeld = new Map(); // pointerId → playing chord
  let latched = null;          // chord kept playing by Latch
  let chordSerial = 0;

  function startChord(btn, ev) {
    const pc = Number(btn.dataset.pc), iv = btn.dataset.iv.split(',').map(Number), name = btn.dataset.name;
    const notes = chordNotes(pc, iv);
    btn.classList.add('on');
    $('#rNote').textContent = name;
    const c = { btn, notes, name, ids: [] };
    if (prefs.arpOn) arpSetNotes(notes);
    else {
      const tag = ++chordSerial;
      c.ids = notes.map((n) => { const id = `chord${tag}-${n}`; noteDown(id, n, name, ev); return id; });
    }
    return c;
  }

  function stopChord(c, ev) {
    c.btn.classList.remove('on');
    c.ids.forEach((id) => noteUp(id, ev));
    if (prefs.arpOn) {
      // the arp follows the most recent chord still held, or stops
      const others = [...chordHeld.values()];
      if (latched && latched !== c) arpSetNotes(latched.notes);
      else if (others.length) arpSetNotes(others[others.length - 1].notes);
      else arpStop();
    }
  }

  function chordDown(btn, ev) {
    ensureAudio();
    if (prefs.arpLatch) {
      const same = latched && latched.btn === btn;
      if (latched) { const old = latched; latched = null; stopChord(old, ev); }
      if (!same) latched = startChord(btn, ev);
      return;
    }
    // a press on a finger the app still thinks is down means its lift was lost: end that chord first
    const stale = chordHeld.get(ev.pointerId);
    if (stale) { chordHeld.delete(ev.pointerId); stopChord(stale, ev); }
    chordHeld.set(ev.pointerId, startChord(btn, ev));
  }

  function chordUp(ev) {
    const c = chordHeld.get(ev.pointerId);
    if (!c) return;
    chordHeld.delete(ev.pointerId);
    stopChord(c, ev);
  }

  function releaseChords(keepLatched = false) {
    for (const [id, c] of [...chordHeld]) { chordHeld.delete(id); stopChord(c); }
    if (latched && !keepLatched) { const c = latched; latched = null; stopChord(c); }
    if (!latched && !chordHeld.size) arpStop();
  }

  // Arpeggiator: steps on the tempo grid (the recording, playback or running drums if any).
  const ARP_RATES = { '1/4': 1, '1/8': 0.5, '1/8T': 1 / 3, '1/16': 0.25, '1/16T': 1 / 6, '1/32': 0.125 };
  let arpRun = null; // { seq, step, nextTime }
  const arpStepDur = () => (60 / bpm() / (state.ts === '6/8' ? 1.5 : 1)) * (ARP_RATES[prefs.arpRate] || 0.5);

  function arpSeq(notes) {
    const up = [...notes].sort((x, y) => x - y);
    const all = Number(prefs.arpOctaves) === 2 ? up.concat(up.map((n) => n + 12)) : up;
    if (prefs.arpPattern === 'down') return [...all].reverse();
    if (prefs.arpPattern === 'updown') return all.concat(all.slice(1, -1).reverse());
    return all;
  }

  function arpSetNotes(notes) {
    ensureAudio();
    const seq = arpSeq(notes);
    if (arpRun) { arpRun.seq = seq; arpRun.notes = notes; return; } // switch chords without losing the beat
    const now = ctx.currentTime + 0.02, sd = arpStepDur();
    const anchor = rec ? rec.t0 : playing ? playing.T : drumTrack && drumTrack.lastBar !== null ? drumTrack.lastBar : now;
    arpRun = { seq, notes, step: 0, nextTime: anchor + Math.ceil((now - anchor) / sd - 1e-6) * sd };
  }
  function arpStop() { arpRun = null; }

  function scheduleArp(now, horizon) {
    if (!arpRun) return;
    if (arpRun.nextTime < now - 0.2) arpRun.nextTime = now + 0.02; // tab was asleep
    while (arpRun && arpRun.nextTime < horizon) {
      const t = arpRun.nextTime, sd = arpStepDur(), seq = arpRun.seq;
      const midi = prefs.arpPattern === 'random' ? seq[Math.floor(Math.random() * seq.length)] : seq[arpRun.step % seq.length];
      const gate = sd * 0.85;
      eng.noteOn(state.preset, midi, t, monitorTrack(), { vel: DEFAULT_VEL, live: true }).release(t + gate);
      if (rec && t >= rec.t0 && rec.track !== RHYTHM) {
        rec.notes.push({ midi, vel: DEFAULT_VEL, preset: state.preset.id, start: t - rec.t0, end: t - rec.t0 + gate });
      }
      arpRun.step++;
      arpRun.nextTime = t + sd;
    }
  }

  /* Chord layouts: "All chords" (types × 12 roots) or one key's 7 diatonic chords. */
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  // keys that are spelled with flats (major / minor)
  const FLAT_KEYS = { major: [5, 10, 3, 8, 1, 6], minor: [2, 7, 0, 5, 10, 3] };
  const TRIAD_Q = { '0,4,7': ['', false], '0,3,7': ['m', true], '0,3,6': ['°', true], '0,4,8': ['+', false] };
  const SEVENTH_Q = { '0,4,7,11': 'maj7', '0,3,7,10': 'm7', '0,4,7,10': '7', '0,3,6,10': 'ø7', '0,3,6,9': '°7', '0,3,7,11': 'm(maj7)', '0,4,8,11': '+maj7' };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  const defaultKey = () => (isPhone() ? '0-major' : 'all');
  const chordKey = () => prefs.chordKey || defaultKey();

  // The 7 chords of a key: per degree a triad, a seventh and (where it fits) a sus chord.
  function diatonicChords(tonic, mode) {
    const sc = SCALES[mode], names = FLAT_KEYS[mode].includes(tonic) ? FLAT_NAMES : SHARP_NAMES;
    const tone = (d) => sc[d % 7] + 12 * Math.floor(d / 7);
    return sc.map((_, d) => {
      const rel = (steps) => steps.map((s) => tone(d + s) - tone(d));
      const pc = (tonic + sc[d]) % 12, root = names[pc];
      const triIv = rel([0, 2, 4]), [tq, minorish] = TRIAD_Q[triIv.join(',')] || ['', false];
      const sevIv = rel([0, 2, 4, 6]);
      const roman = (minorish ? ROMAN[d].toLowerCase() : ROMAN[d]) + (tq === '°' ? '°' : tq === '+' ? '+' : '');
      // sus: sus2 if the 2nd is a whole step and the 5th is perfect, else sus4 if the 4th and 5th are perfect
      const second = tone(d + 1) - tone(d), fourth = tone(d + 3) - tone(d), fifth = tone(d + 4) - tone(d);
      const sus = fifth !== 7 ? null : second === 2 ? { name: root + 'sus2', iv: [0, 2, 7] } : fourth === 5 ? { name: root + 'sus4', iv: [0, 5, 7] } : null;
      return {
        roman,
        cells: [
          { name: root + tq, pc, iv: triIv },
          { name: root + (SEVENTH_Q[sevIv.join(',')] || '7'), pc, iv: sevIv },
          sus && { ...sus, pc },
        ],
      };
    });
  }

  function chordLayout() {
    const key = chordKey();
    if (key === 'all') {
      const hidden = prefs.chordHide || [];
      const types = CHORD_TYPES.filter((t) => !hidden.includes(t.label));
      return {
        head: null,
        rows: types.map((t) => ({ label: t.label, maj: t.label === 'Maj', cells: CHORD_ROOTS.map(([r, pc]) => ({ name: r + t.suffix, pc, iv: t.iv })) })),
      };
    }
    const [tonic, mode] = key.split('-');
    const degs = diatonicChords(Number(tonic), mode);
    return {
      head: degs.map((d) => d.roman),
      rows: ['Triad', '7th', 'Sus'].map((label, ri) => ({ label, maj: ri === 0, cells: degs.map((d) => d.cells[ri]) })),
    };
  }

  function renderChordGrid() {
    releaseChords();
    const grid = $('#chordGrid'), L = chordLayout();
    const keyMode = chordKey() !== 'all';
    grid.classList.toggle('key-mode', keyMode);
    grid.style.setProperty('--cols', L.rows[0] ? L.rows[0].cells.length : 12);
    grid.innerHTML = '';
    const cell = (cls, text) => { const el = document.createElement('span'); el.className = cls; el.textContent = text; grid.appendChild(el); return el; };
    if (L.head) { cell('chord-row-label', ''); L.head.forEach((h) => cell('chord-degree', h)); }
    for (const row of L.rows) {
      cell('chord-row-label', row.label);
      for (const c of row.cells) {
        if (!c) { cell('chord-empty', ''); continue; }
        const b = document.createElement('button');
        b.className = 'chord-pad' + (row.maj ? ' maj' : '');
        b.dataset.pc = c.pc; b.dataset.iv = c.iv.join(','); b.dataset.name = c.name;
        if (keyMode) { // root above, chord type below, so long names fit narrow pads
          const m = /^([A-G][♯♭]?)(.*)$/.exec(c.name);
          b.innerHTML = `<b>${m[1]}</b><small>${m[2] || 'maj'}</small>`;
        } else b.textContent = c.name;
        grid.appendChild(b);
      }
    }
    // the chips and key menu reflect the current choice
    $('#chordKey').value = chordKey();
    $('#chordChips').hidden = keyMode;
    for (const chip of $('#chordChips').children) chip.classList.toggle('on', !(prefs.chordHide || []).includes(chip.dataset.label));
  }

  (function wireChordGrid() {
    const grid = $('#chordGrid');
    grid.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.chord-pad');
      if (!b) return;
      e.preventDefault();
      if (!prefs.arpLatch) { try { b.setPointerCapture(e.pointerId); } catch (err) {} }
      chordDown(b, e);
    });
    // the browser took the touch away from a pad (scroll, system gesture…): end its chord
    grid.addEventListener('lostpointercapture', (e) => chordUp(e), true);

    // Key menu: All chords, then every major and minor key (circle of fifths order)
    const sel = $('#chordKey');
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    sel.innerHTML = opt('all', 'All chords')
      + `<optgroup label="Major keys">${CHORD_ROOTS.map(([, pc]) => opt(`${pc}-major`, `${(FLAT_KEYS.major.includes(pc) ? FLAT_NAMES : SHARP_NAMES)[pc]} major`)).join('')}</optgroup>`
      + `<optgroup label="Minor keys">${[9, 4, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2].map((pc) => opt(`${pc}-minor`, `${(FLAT_KEYS.minor.includes(pc) ? FLAT_NAMES : SHARP_NAMES)[pc]} minor`)).join('')}</optgroup>`;
    sel.addEventListener('change', (e) => { prefs.chordKey = e.target.value; savePrefs(); renderChordGrid(); e.target.blur(); });

    // chord-type chips (All chords): show / hide whole rows; at least one stays
    const chips = $('#chordChips');
    for (const t of CHORD_TYPES) {
      const c = document.createElement('button');
      c.className = 'chip'; c.dataset.label = t.label; c.textContent = t.label;
      c.title = `Show or hide the ${t.label} row`;
      c.addEventListener('click', () => {
        const hide = new Set(prefs.chordHide || []);
        if (hide.has(t.label)) hide.delete(t.label);
        else if (hide.size < CHORD_TYPES.length - 1) hide.add(t.label);
        prefs.chordHide = [...hide];
        savePrefs();
        renderChordGrid();
        c.blur();
      });
      chips.appendChild(c);
    }
  })();

  // Chord releases are caught anywhere on the page: phone browsers don't always send the
  // "finger lifted" event to the pad that was pressed.
  const releaseIfAllUp = () => { if (chordHeld.size) releaseChords(true); };
  window.addEventListener('pointerup', (e) => chordUp(e), true);
  window.addEventListener('pointercancel', (e) => chordUp(e), true);
  // no fingers on the screen → nothing unlatched may still be playing
  document.addEventListener('touchend', (e) => { if (e.touches.length === 0) releaseIfAllUp(); }, true);
  document.addEventListener('touchcancel', (e) => { if (e.touches.length === 0) releaseIfAllUp(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') releaseIfAllUp(); });

  function setPlayMode(mode) {
    releaseChords();
    prefs.playMode = mode === 'chords' ? 'chords' : 'keys';
    savePrefs();
    renderPlayMode();
  }
  function renderPlayMode() {
    const chords = prefs.playMode === 'chords' || isPhone();
    $('#keyboard').hidden = chords;
    $('#chordGrid').hidden = !chords;
    $('#chordTop').hidden = !chords;
    $('#keysCtl').hidden = chords;
    $('#chordCtl').hidden = !chords;
    $('#playTitle').textContent = chords ? 'Chords' : 'Keyboard';
    $('#modeKeys').classList.toggle('on', !chords);
    $('#modeChords').classList.toggle('on', chords);
    $('#arpOn').classList.toggle('on', prefs.arpOn);
    $('#arpLatch').classList.toggle('on', prefs.arpLatch);
    $('#arpRate').value = prefs.arpRate;
    $('#arpPattern').value = prefs.arpPattern;
    $('#arpOctaves').value = String(prefs.arpOctaves);
  }

  /* ---------------- MIDI keyboard input (Web MIDI) ---------------- */
  const midiSupported = typeof navigator.requestMIDIAccess === 'function';
  let midiAccess = null, midiError = null;
  const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const midiNoteName = (n) => PC_NAMES[n % 12] + (Math.floor(n / 12) - 1);

  async function enableMidi() {
    if (!midiSupported || prefs.midiOff) return;
    try {
      midiAccess = await navigator.requestMIDIAccess();
      midiError = null;
      prefs.midiEnabled = true;
      savePrefs();
      midiAccess.onstatechange = () => { bindMidiInputs(); renderMidi(); };
      bindMidiInputs();
    } catch (err) {
      midiError = err;
    }
    renderMidi();
  }

  const midiInputs = () => (midiAccess ? [...midiAccess.inputs.values()].filter((i) => i.state === 'connected') : []);
  const listening = (inp) => !prefs.midiInput || prefs.midiInput === 'all' || prefs.midiInput === inp.name;
  function bindMidiInputs() {
    if (!midiAccess) return;
    for (const inp of midiAccess.inputs.values()) {
      inp.onmidimessage = (e) => {
        monitorFeed(inp, e);
        if (listening(inp)) onMidiMessage(e);
      };
    }
  }

  function onMidiMessage(e) {
    const [st, d1 = 0, d2 = 0] = e.data;
    const type = st & 0xf0, ch = st & 15;
    if (type === 0x90 && d2 > 0) {
      ensureAudio();
      if (ctx.state !== 'running') setStatus('Click anywhere once to start audio');
      noteDown(`midi${ch}-${d1}`, d1, midiNoteName(d1), e, d2 / 127);
      midiBlink();
    } else if (type === 0x80 || type === 0x90) {
      noteUp(`midi${ch}-${d1}`, e);
    } else if (type === 0xb0) {
      if (d1 === 64) { if ((d2 >= 64) !== state.sustain) { ensureAudio(); setSustain(d2 >= 64, e); } } // sustain pedal
      else if (d1 === 1) { if (eng) eng.setMod(d2 / 127); } // mod wheel → vibrato
      else if (d1 === 123 || d1 === 120) releaseAll(); // all notes / sound off
    } else if (type === 0xe0) {
      const v = (d2 << 7) | d1; // pitch bend, ±2 semitones
      if (eng) eng.setBend(((v - 8192) / 8192) * 200);
    }
  }

  /* MIDI test window: shows every incoming message and which keys have been received,
     to tell a keyboard problem from an app problem. */
  const midiMon = $('#midiMon');
  const monSeen = new Set(), monHeld = new Set();
  let monLog = [];
  function monitorFeed(inp, e) {
    if (!midiMon.open) return;
    const [st, d1 = 0, d2 = 0] = e.data;
    const type = st & 0xf0, ch = (st & 15) + 1;
    let what;
    if (type === 0x90 && d2 > 0) { what = `Note on   ${midiNoteName(d1).padEnd(4)} (${d1})  vel ${d2}`; monSeen.add(d1); monHeld.add(d1); }
    else if (type === 0x80 || type === 0x90) { what = `Note off  ${midiNoteName(d1).padEnd(4)} (${d1})`; monHeld.delete(d1); }
    else if (type === 0xb0) what = d1 === 64 ? `Sustain pedal  ${d2 >= 64 ? 'down' : 'up'} (${d2})` : d1 === 1 ? `Mod wheel  ${d2}` : `Control ${d1} = ${d2}`;
    else if (type === 0xe0) what = `Pitch bend  ${(((d2 << 7) | d1) - 8192)}`;
    else if (type === 0xd0) what = `Aftertouch  ${d1}`;
    else if (st >= 0xf8) return; // clock / active sensing: too chatty to show
    else what = `Other  ${[...e.data].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`;
    const ignored = !listening(inp) ? '  · not the selected input' : '';
    monLog.unshift(`ch ${String(ch).padStart(2)}  ${what}${ignored}  — ${inp.name}`);
    monLog = monLog.slice(0, 14);
    renderMonitor();
  }
  function renderMonitor() {
    $('#monLog').textContent = monLog.length ? monLog.join('\n') : 'Waiting for MIDI… play a key.';
    for (const el of $('#monKeys').children) {
      const n = Number(el.dataset.n);
      el.classList.toggle('seen', monSeen.has(n));
      el.classList.toggle('down', monHeld.has(n));
    }
    const in88 = [...monSeen].filter((n) => n >= 21 && n <= 108).length;
    $('#monCount').textContent = `${in88} of 88 keys received` + (monSeen.size > in88 ? ` (+${monSeen.size - in88} outside the 88-key range)` : '');
    const ins = midiInputs();
    $('#monDevices').textContent = !midiAccess ? 'MIDI is not connected yet.'
      : ins.length ? 'Listening to: ' + ins.map((i) => i.name + (listening(i) ? '' : ' (not selected in Settings)')).join(', ')
      : 'No MIDI devices found. Check the cable and that the keyboard is switched on.';
  }
  (function buildMonitorKeys() { // A0 (21) … C8 (108): white keys in a row, black keys on top
    const box = $('#monKeys');
    const whites = [];
    for (let n = 21; n <= 108; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
    const w = 100 / whites.length;
    for (let n = 21; n <= 108; n++) {
      const k = document.createElement('i');
      k.dataset.n = n;
      k.title = `${midiNoteName(n)} (${n})`;
      if ([1, 3, 6, 8, 10].includes(n % 12)) {
        k.className = 'mk-b';
        k.style.left = `${whites.indexOf(n - 1) * w + w * 0.68}%`;
        k.style.width = `${w * 0.64}%`;
      } else {
        k.className = 'mk-w';
        k.style.left = `${whites.indexOf(n) * w}%`;
        k.style.width = `${w}%`;
      }
      box.appendChild(k);
    }
  })();
  function openMonitor() {
    if (!midiAccess) enableMidi();
    renderMonitor();
    if (!midiMon.open) midiMon.showModal();
  }

  let blinkTimer = null;
  function midiBlink() {
    const ind = $('#midiInd');
    ind.classList.add('act');
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => ind.classList.remove('act'), 90);
  }

  // Header indicator + the MIDI row in Settings.
  // MIDI switched off in Settings: never ask the browser, and drop any connection.
  function disableMidi() {
    if (midiAccess) for (const inp of midiAccess.inputs.values()) inp.onmidimessage = null;
    midiAccess = null;
    midiError = null;
    for (const id of [...held.keys()]) if (id.startsWith('midi')) noteUp(id);
    if (eng) { eng.setBend(0); eng.setMod(0); }
    prefs.midiEnabled = false;
    savePrefs();
  }

  function renderMidi() {
    const off = !!prefs.midiOff;
    $('#midiInd').hidden = off;
    $('#midiToggle').classList.toggle('on', !off);
    $('#midiToggle').setAttribute('aria-pressed', String(!off));
    $('#midiToggleLbl').textContent = off ? 'Off' : 'On';
    $('#midiControls').hidden = off;
    if (off) {
      $('#midiHint').textContent = 'MIDI is off: the app won’t ask the browser for access or show the MIDI light. Turn it on to use a MIDI keyboard.';
      return;
    }
    const ind = $('#midiInd'), inputs = midiInputs(), used = inputs.filter(listening);
    ind.classList.toggle('connected', used.length > 0);
    ind.classList.toggle('unsupported', !midiSupported);
    ind.title = !midiSupported ? 'MIDI keyboards need Chrome, Edge or Firefox (not available in this browser)'
      : !midiAccess ? (midiError ? 'MIDI access was blocked. Allow it in the browser’s site settings, then click to retry.' : 'Click to connect a MIDI keyboard')
      : used.length ? `MIDI: ${used.map((i) => i.name).join(', ')}` : 'No MIDI keyboard found. Plug one in.';
    const sel = $('#midiInput');
    if (!sel) return;
    const opts = [['all', 'All devices'], ...inputs.map((i) => [i.name, i.name])];
    if (prefs.midiInput && prefs.midiInput !== 'all' && !inputs.some((i) => i.name === prefs.midiInput)) opts.push([prefs.midiInput, `${prefs.midiInput} (not connected)`]);
    sel.innerHTML = opts.map(([v, t]) => `<option value="${v.replace(/"/g, '&quot;')}">${t}</option>`).join('');
    sel.value = prefs.midiInput || 'all';
    sel.disabled = !midiAccess;
    $('#midiConnect').hidden = !!midiAccess || !midiSupported;
    $('#midiTest').disabled = !midiSupported;
    $('#midiHint').textContent = !midiSupported ? 'Not available in this browser. Use Chrome, Edge or Firefox on desktop.'
      : !midiAccess ? 'Connect to play the synth from a MIDI keyboard: velocity, sustain pedal, pitch bend (±2 semitones) and mod wheel (vibrato).'
      : inputs.length ? `${inputs.length} device${inputs.length > 1 ? 's' : ''} found. Velocity, sustain pedal, pitch bend and mod wheel all work.`
      : 'No MIDI devices found. Plug a keyboard in and it will appear here.';
  }

  /* ---------------- UI: readouts ---------------- */
  function setStatus(text, cls) {
    const el = $('#rStatus');
    if (el.textContent === text && el.className === 'status' + (cls ? ' ' + cls : '')) return;
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function fmtTime(s) {
    s = Math.max(0, s);
    const m = Math.floor(s / 60), sec = s - m * 60;
    return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
  }

  function refreshButtons() {
    $('#btnRec').classList.toggle('on', !!rec);
    const target = monitorTrack();
    [0, 1, RHYTHM].forEach((i) => {
      const id = i === RHYTHM ? 'R' : String(i + 1);
      const b = $('#btnT' + id), m = $('#btnM' + id);
      const notes = i === RHYTHM ? (take ? take.hits.filter((h) => h.inst) : null) : take && take.tracks[i];
      // lit = this is where Rec goes (chosen by you, or picked automatically)
      const armed = rec ? rec.track === i : target === i;
      b.classList.toggle('on', armed);
      b.classList.toggle('auto', armed && !rec && state.armed !== i);
      b.classList.toggle('rec', !!rec && rec.track === i);
      b.setAttribute('aria-pressed', String(state.armed === i));
      b.disabled = !!rec;
      $('#t' + id + 'count').textContent = notes && notes.length ? notes.length : '—';
      m.disabled = !notes || !notes.length;
      $('#btnC' + id).disabled = !notes || !notes.length || !!rec;
      m.classList.toggle('on', !!notes && state.mute[i]);
      m.setAttribute('aria-pressed', String(!!notes && state.mute[i]));
    });
    const tgt = $('#rTarget');
    tgt.textContent = rec ? `● Rec · ${trackName(rec.track)}` : `Rec → ${trackName(target)}`;
    tgt.classList.toggle('rec', !!rec);
    $('#btnClear').disabled = !take;
    $('#takeName').classList.toggle('empty', !take); // keeps its space so the header doesn't jump
    if (take && document.activeElement !== nameField) {
      nameField.textContent = takeName();
      $('#takeName').classList.toggle('custom', !!take.name);
    }
    nameField.contentEditable = String(!!take && !rec);
    $('#btnUndo').disabled = !undoSnap || !!rec;
    $('#btnImport').disabled = !!rec;
    $('#btnUndo').title = undoSnap ? `Undo the last ${undoSnap.what} (⌘Z / Ctrl+Z)` : 'Nothing to undo';
    $('#btnQuant').disabled = !canQuantize();
    $('#btnQuant').title = canQuantize()
      ? 'Snap notes to the recorded drum grid (Q)'
      : 'Record with the Rhythm running to use Quantize';
    $('#drumsLabel').textContent = drumTrack ? 'Stop' : 'Start';
    $('#psLabel').textContent = drumTrack ? 'Stop' : 'Start';
    $('#psDrums').classList.toggle('on', !!drumTrack);
    $('#btnQuant').classList.toggle('on', canQuantize() && state.quant > 0);
    $('#btnQuant').querySelector('small').textContent = QUANT[state.quant].label;
    $('#btnPlay').classList.toggle('on', !!playing);
    $('#btnLoop').classList.toggle('on', state.loop);
    $('#btnExport').classList.toggle('on', exporting);
    $('#btnPlay').disabled = !take;
    $('#btnExport').disabled = !take || exporting;
    $('#btnMidi').disabled = !take;
    $('#btnDrums').classList.toggle('on', !!drumTrack);
    $('#btnCount').classList.toggle('on', state.countIn);
    $('#btnFxBypass').classList.toggle('on', state.settings.drumFxBypass);
    $('#btnEchoSync').classList.toggle('on', state.settings.echoSync);
    $('#btnFxOff').classList.toggle('on', state.settings.fxOff);
    $('#echoTimeLbl').textContent = `${Math.round(echoTime(state.settings) * 1000)} ms`;
    $('#knobs').classList.toggle('fx-off', state.settings.fxOff);
    [['#btnVintage', 'vintageEq'], ['#btnTapeSat', 'tapeSat']].forEach(([id, key]) => {
      $(id).classList.toggle('on', state.settings[key]);
      $(id).setAttribute('aria-pressed', String(state.settings[key]));
    });
  }

  function refreshRhythm() {
    $('#psBpm').textContent = bpm();
    $('#psPattern').value = state.rhythm;
    [...$('#rhythmGrid').children].forEach((b) => b.classList.toggle('on', b.dataset.id === state.rhythm));
    [...$('#tsGrid').children].forEach((b) => b.classList.toggle('on', b.dataset.id === state.ts));
    $("#rTempo").textContent = `${bpm()} ${state.ts}`;
  }

  function updateMods() {
    $('#modSharp').classList.toggle('on', state.sharp && !state.flat);
    $('#modFlat').classList.toggle('on', state.flat && !state.sharp);
    $('#modSharp').setAttribute('aria-pressed', String(state.sharp && !state.flat));
    $('#modFlat').setAttribute('aria-pressed', String(state.flat && !state.sharp));
  }

  const octave = () => state.octave;

  function setOctave(o) {
    state.octave = Math.max(1, Math.min(7, o));
    showOctave();
  }

  function showOctave() {
    if (typeof labelKeys === 'function' && keyEls.length) labelKeys();
    $('#rOct').textContent = state.octave;
  }

  function click(id, fn) {
    $(id).addEventListener('click', (e) => { fn(e); e.currentTarget.blur(); });
  }

  /* ---------------- UI: presets ---------------- */
  const grid$ = $('#presetGrid');
  PRESETS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.innerHTML = `<span class="lamp"></span>
      <span class="num">${i < 10 ? (i + 1) % 10 : '⇧' + (i - 9)}<span class="cat">${p.cat}</span></span>
      <span class="name">${p.name}</span>`;
    b.addEventListener('click', () => { selectPreset(i); b.blur(); });
    grid$.appendChild(b);
  });

  function selectPreset(i) {
    state.preset = PRESETS[i];
    [...grid$.children].forEach((b, j) => b.classList.toggle('on', i === j));
    $('#rPreset').textContent = state.preset.name;
    $('#phoneSound').value = String(i);
  }

  // Phone view: the sound grid is hidden, so a compact sound menu sits above the chords.
  (function buildPhoneSound() {
    const sel = $('#phoneSound');
    const cats = [...new Set(PRESETS.map((p) => p.cat))];
    sel.innerHTML = cats.map((c) => `<optgroup label="${c}">${PRESETS.map((p, i) => (p.cat === c ? `<option value="${i}">${p.name}</option>` : '')).join('')}</optgroup>`).join('');
    sel.addEventListener('change', (e) => { selectPreset(Number(e.target.value)); e.target.blur(); });
  })();

  /* ---------------- UI: knobs ---------------- */
  const KNOBS = [
    [
      { key: 'tone', label: 'Tone', min: 0.25, max: 3, log: true, fmt: (v) => v.toFixed(2) + '×' },
      { key: 'attack', label: 'Attack', min: 0.2, max: 4, log: true, fmt: (v) => v.toFixed(2) + '×' },
      { key: 'release', label: 'Release', min: 0.2, max: 4, log: true, fmt: (v) => v.toFixed(2) + '×' },
    ],
    [
      { key: 'echo', label: 'Echo', min: 0, max: 1, fmt: (v) => Math.round(v * 100) + '%' },
      { key: 'space', label: 'Space', min: 0, max: 1, fmt: (v) => Math.round(v * 100) + '%' },
    ],
    [
      { key: 'volume', label: 'Volume', min: 0, max: 1, fmt: (v) => Math.round((masterVolGain(v) / masterVolGain(0.5)) * 100) + '%', accent: true },
    ],
  ];
  const RHYTHM_KNOBS = [
    { key: 'bpm', label: 'Tempo', min: 40, max: 200, fmt: (v) => Math.round(v) + ' bpm', accent: true, editable: true,
      onChange: () => { refreshRhythm(); const l = $('#echoTimeLbl'); if (l) l.textContent = `${Math.round(echoTime(state.settings) * 1000)} ms`; } },
    { key: 'drums', label: 'Level', min: 0, max: 1, fmt: (v) => Math.round(v * 100) + '%' },
  ];

  function tickSvg() {
    let s = '<svg viewBox="0 0 72 72">';
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      const r1 = 33, r2 = i % 5 === 0 ? 28.5 : 30.5;
      const x1 = 36 + Math.sin(a) * r1, y1 = 36 - Math.cos(a) * r1;
      const x2 = 36 + Math.sin(a) * r2, y2 = 36 - Math.cos(a) * r2;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 1.4 : 1}" stroke-linecap="round"/>`;
    }
    return s + '</svg>';
  }

  // Arrow keys / Home / End adjust a focused knob (reached with Tab); Enter edits if it can.
  function keyAdjust(el, getNorm, set, onEnter) {
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.005 : 0.02;
      const moves = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.1, PageDown: -0.1 };
      let n = null;
      if (e.key in moves) n = getNorm() + moves[e.key];
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = 1;
      else if (e.key === 'Enter' && onEnter) { e.preventDefault(); e.stopPropagation(); onEnter(); return; }
      if (n === null) return;
      e.preventDefault();
      e.stopPropagation();
      set(n);
    });
  }

  function buildKnob(cfg) {
    const wrap = document.createElement('div');
    wrap.className = 'knob-wrap';
    wrap.innerHTML = `<div class="knob${cfg.accent ? ' accent' : ''}" title="Drag up/down · double-click to ${cfg.editable ? 'type a value' : 'reset'}">${tickSvg()}<div class="cap"><i></i></div></div>
      <label>${cfg.label}</label><output></output>`;
    const knob = wrap.querySelector('.knob'), cap = wrap.querySelector('.cap'), out = wrap.querySelector('output');
    knob.tabIndex = 0;
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', cfg.label);
    const def = state.settings[cfg.key];
    const toNorm = (v) => (cfg.log ? Math.log(v / cfg.min) / Math.log(cfg.max / cfg.min) : (v - cfg.min) / (cfg.max - cfg.min));
    const fromNorm = (n) => (cfg.log ? cfg.min * Math.pow(cfg.max / cfg.min, n) : cfg.min + (cfg.max - cfg.min) * n);
    let norm = toNorm(def);

    const set = (n) => {
      norm = Math.max(0, Math.min(1, n));
      const v = fromNorm(norm);
      state.settings[cfg.key] = v;
      cap.style.setProperty('--rot', `${-135 + norm * 270}deg`);
      out.textContent = cfg.fmt(v);
      knob.setAttribute('aria-valuetext', cfg.fmt(v));
      if (eng) eng.applyMix();
      if (cfg.onChange) cfg.onChange(v);
    };
    set(norm);
    wrap.setValue = (v) => set(toNorm(Math.min(cfg.max, Math.max(cfg.min, v))));
    wrap.getValue = () => fromNorm(norm);
    keyAdjust(knob, () => norm, set, cfg.editable ? () => startEdit() : null);

    let startY = 0, startN = 0;
    knob.addEventListener('mousedown', (e) => e.preventDefault()); // no focus from clicks: arrows stay octave keys
    knob.addEventListener('pointerdown', (e) => {
      knob.setPointerCapture(e.pointerId);
      startY = e.clientY; startN = norm;
    });
    knob.addEventListener('pointermove', (e) => {
      if (!knob.hasPointerCapture(e.pointerId)) return;
      const scale = e.shiftKey ? 600 : 180;
      set(startN + (startY - e.clientY) / scale);
    });
    knob.addEventListener('wheel', (e) => { e.preventDefault(); set(norm - e.deltaY / 1500); }, { passive: false });
    if (!cfg.editable) {
      knob.addEventListener('dblclick', () => set(toNorm(def)));
      return wrap;
    }

    // Editable knobs: double-click the knob, label or value to type a number.
    function startEdit() {
      if (wrap.querySelector('input')) return;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'knob-edit';
      inp.min = cfg.min; inp.max = cfg.max; inp.step = 1;
      inp.value = Math.round(fromNorm(norm));
      out.replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        const v = parseFloat(inp.value);
        if (commit && Number.isFinite(v)) set(toNorm(Math.min(cfg.max, Math.max(cfg.min, v))));
        inp.replaceWith(out);
      };
      // keep typing out of the note / transport shortcuts
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      inp.addEventListener('keyup', (e) => e.stopPropagation());
      inp.addEventListener('blur', () => finish(true));
    }
    [knob, wrap.querySelector('label'), out].forEach((el) => el.addEventListener('dblclick', startEdit));
    wrap.querySelector('label').title = out.title = 'Double-click to type a value';
    return wrap;
  }

  const knobsEl = $('#knobs');
  KNOBS.forEach((group, gi) => {
    if (gi) { const d = document.createElement('div'); d.className = 'knob-divider'; knobsEl.appendChild(d); }
    const g = document.createElement('div');
    g.className = 'knob-group';
    group.forEach((cfg) => g.appendChild(buildKnob(cfg)));
    if (gi === 1) { // Echo / Space switches
      const t = document.createElement('div');
      t.className = 'fx-toggles';
      t.innerHTML = `
        <button class="mod tog" id="btnEchoSync" title="Sync the echo to the tempo (dotted eighth)"><span class="lamp"></span>Echo Sync<small id="echoTimeLbl"></small></button>
        <button class="mod tog" id="btnFxOff" title="Turn Echo and Space off completely"><span class="lamp"></span>Bypass</button>`;
      g.appendChild(t);
      // colour switches for the whole synth (not the drums)
      const c = document.createElement('div');
      c.className = 'fx-toggles fx-colour';
      c.innerHTML = `
        <button class="mod tog" id="btnVintage" title="Vintage EQ: a muffled, 60s-record tone (low-pass around 550 Hz)" aria-pressed="false"><span class="lamp"></span>Vintage EQ</button>
        <button class="mod tog" id="btnTapeSat" title="Tape saturation: soft clipping, a little low-end warmth and a softer top" aria-pressed="false"><span class="lamp"></span>Tape Saturation</button>`;
      g.appendChild(c);
    }
    knobsEl.appendChild(g);
  });

  /* ---------------- UI: rhythm box ---------------- */
  const rhythmKnobs = RHYTHM_KNOBS.map((cfg) => $('#rhythmKnobs').appendChild(buildKnob(cfg)));
  const tempoKnob = rhythmKnobs[0];

  const nudgeTempo = (d) => tempoKnob.setValue(Math.round(tempoKnob.getValue()) + d);
  // phone rhythm strip (pinned to the top of the screen)
  click('#psDrums', () => toggleDrums());
  click('#psDown', () => nudgeTempo(-1));
  click('#psUp', () => nudgeTempo(1));
  $('#psPattern').innerHTML = RHYTHMS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  $('#psPattern').addEventListener('change', (e) => { const v = e.target.value; changeGrid(() => (state.rhythm = v)); e.target.blur(); });
  click('#tempoDown', (e) => nudgeTempo(e && e.shiftKey ? -5 : -1));
  click('#tempoUp', (e) => nudgeTempo(e && e.shiftKey ? 5 : 1));

  // Tap tempo: average the gaps between the last few taps.
  let taps = [];
  $('#tapTempo').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const gap = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      tempoKnob.setValue(60000 / gap);
    }
    const b = $('#tapTempo');
    b.classList.add('on');
    setTimeout(() => b.classList.remove('on'), 90);
  });

  RHYTHMS.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'preset small';
    b.dataset.id = r.id;
    b.innerHTML = `<span class="lamp"></span><span class="name">${r.name}</span>`;
    b.addEventListener('click', () => { changeGrid(() => (state.rhythm = r.id)); b.blur(); });
    $('#rhythmGrid').appendChild(b);
  });

  TIME_SIGS.forEach((ts) => {
    const b = document.createElement('button');
    b.className = 'seg';
    b.dataset.id = ts.id;
    b.textContent = ts.id;
    b.addEventListener('click', () => { changeGrid(() => (state.ts = ts.id)); b.blur(); });
    $('#tsGrid').appendChild(b);
  });

  /* ---------------- UI: on-screen keyboard ---------------- */
  // Three octaves with piano proportions: the current octave in the middle,
  // one below and one above. Keys hold their offset from the lowest C.
  const kb = $('#keyboard');
  const OCTAVES = 3;
  const keyEls = []; // { el, offset }
  const kbBase = () => Math.max(0, octave() - 1); // octave number of the lowest C shown
  for (let o = 0; o < OCTAVES; o++) {
    WHITE.forEach((L, wi) => {
      const k = document.createElement('div');
      k.className = 'wkey';
      k.dataset.offset = o * 12 + NOTE_PC[L];
      k.dataset.name = L;
      k.innerHTML = '<span></span>';
      kb.appendChild(k);
      keyEls.push({ el: k, offset: o * 12 + NOTE_PC[L] });
    });
  }
  const whiteW = 100 / (7 * OCTAVES);
  for (let o = 0; o < OCTAVES; o++) {
    BLACK.forEach((b) => {
      const k = document.createElement('div');
      k.className = 'bkey';
      k.dataset.offset = o * 12 + b.pc;
      k.dataset.name = b.name;
      // black keys are ~58% as wide as white keys, centred on the gap between them
      k.style.left = `${(o * 7 + b.after + 1) * whiteW - whiteW * 0.29}%`;
      k.style.width = `${whiteW * 0.58}%`;
      kb.appendChild(k);
      keyEls.push({ el: k, offset: o * 12 + b.pc });
    });
  }

  // Only the current octave's C is labelled (e.g. C4), marking the middle octave.
  function labelKeys() {
    const base = kbBase();
    for (const { el, offset } of keyEls) {
      const oct = base + Math.floor(offset / 12);
      el.classList.toggle('cur', oct === octave());
      if (el.classList.contains('wkey')) {
        el.firstChild.textContent = el.dataset.name === 'C' && oct === octave() ? 'C' + oct : '';
      }
    }
    lastLit = null;
  }

  kb.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('[data-offset]');
    if (!k) return;
    kb.setPointerCapture(e.pointerId);
    const midi = 12 * (kbBase() + 1) + Number(k.dataset.offset);
    noteDown('ptr' + e.pointerId, midi, k.dataset.name + Math.floor(midi / 12 - 1), e);
  });
  const ptrUp = (e) => noteUp('ptr' + e.pointerId, e);
  kb.addEventListener('pointerup', ptrUp);
  kb.addEventListener('pointercancel', ptrUp);

  /* ---------------- computer keyboard ---------------- */
  const typing = (e) => e.target instanceof HTMLInputElement && e.target.type !== 'range';

  document.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (settingsDlg.open || renderDlg.open) return;
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!e.repeat) flashShortcut(e);
    if (e.key === '?') { e.preventDefault(); toggleShortcuts(); return; }
    const c = e.code;

    if (c === 'Equal' || c === 'NumpadAdd') { state.sharp = true; updateMods(); e.preventDefault(); return; }
    if (c === 'Minus' || c === 'NumpadSubtract') { state.flat = true; updateMods(); e.preventDefault(); return; }
    if (c === 'Space') { e.preventDefault(); if (!e.repeat) { ensureAudio(); setSustain(true); } return; }
    if (c === 'ArrowUp' || c === 'ArrowDown') {
      e.preventDefault();
      if (e.repeat) return;
      setOctave(state.octave + (c === 'ArrowUp' ? 1 : -1)); // one octave per press, and it stays
      return;
    }
    if (e.repeat) { if (NOTE_KEYS[c]) e.preventDefault(); return; }

    const nk = NOTE_KEYS[c];
    if (nk) {
      e.preventDefault();
      const acc = state.sharp && !state.flat ? 1 : state.flat && !state.sharp ? -1 : 0;
      const midi = 12 * (octave() + 1) + nk.pc + acc;
      const PCN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
      const name = !acc ? nk.name
        : nk.letter.length === 1 ? nk.letter + (acc > 0 ? '♯' : '♭') // A–G with +/−
        : PCN[(nk.pc + acc + 12) % 12];                              // W / V with +/−
      noteDown(c, midi, name + octave(), e);
      return;
    }
    const d = /^Digit(\d)$/.exec(c);
    if (d) {
      // 1–0 pick sounds 1–10; Shift+1, Shift+2… pick 11, 12…
      const i = (Number(d[1]) + 9) % 10 + (e.shiftKey ? 10 : 0);
      if (i < PRESETS.length) selectPreset(i);
      return;
    }

    switch (c) {
      case 'KeyZ': setOctave(state.octave - 1); break;
      case 'KeyX': setOctave(state.octave + 1); break;
      case 'KeyR': rec ? stopRecording() : startRecording(); break;
      case 'KeyP': playing ? stopPlayback() : startPlayback(); break;
      case 'KeyL': state.loop = !state.loop; refreshButtons(); break;
      case 'KeyT': toggleDrums(); break;
      case 'KeyQ': cycleQuant(); break;
      case 'Escape': stopAll(); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (typing(e)) return;
    const c = e.code;
    if (c === 'Equal' || c === 'NumpadAdd') { state.sharp = false; updateMods(); return; }
    if (c === 'Minus' || c === 'NumpadSubtract') { state.flat = false; updateMods(); return; }
    if (c === 'Space') { setSustain(false, e); return; }
    if (NOTE_KEYS[c]) noteUp(c, e);
  });

  window.addEventListener('blur', releaseAll);

  /* ---------------- buttons ---------------- */
  click('#btnRec', () => (rec ? stopRecording() : startRecording()));
  click('#btnPlay', () => (playing ? stopPlayback() : startPlayback()));
  click('#btnStop', stopAll);
  click('#btnLoop', () => { state.loop = !state.loop; refreshButtons(); });
  click('#btnExport', exportTake);
  click('#btnMidi', exportMidi);
  click('#btnDrums', toggleDrums);
  click('#btnCount', () => { state.countIn = !state.countIn; refreshButtons(); });
  click('#btnFxBypass', () => {
    state.settings.drumFxBypass = !state.settings.drumFxBypass;
    if (eng) eng.applyMix();
    refreshButtons();
  });
  click('#btnQuant', cycleQuant);
  click('#btnT1', () => selectTrack(0));
  click('#btnT2', () => selectTrack(1));
  click('#btnM1', () => toggleMute(0));
  click('#btnM2', () => toggleMute(1));
  click('#btnC1', () => clearTrack(0));
  click('#btnC2', () => clearTrack(1));
  click('#btnTR', () => selectTrack(RHYTHM));
  click('#btnMR', () => toggleMute(RHYTHM));
  click('#btnCR', () => clearTrack(RHYTHM));
  click('#btnClear', clearTracks);
  click('#btnUndo', undo);
  click('#btnImport', () => $('#midiFile').click());
  $('#midiFile').addEventListener('change', (e) => {
    importMidiFile(e.target.files[0]);
    e.target.value = ''; // allow importing the same file again
  });
  // drop a .mid file anywhere on the page
  const isMidi = (f) => f && /\.midi?$/i.test(f.name);
  document.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file')) { e.preventDefault(); document.body.classList.add('dropping'); }
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  document.addEventListener('drop', (e) => {
    document.body.classList.remove('dropping');
    const f = [...(e.dataTransfer?.files || [])].find(isMidi);
    if (!f) return;
    e.preventDefault();
    importMidiFile(f);
  });
  [['#btnEchoSync', 'echoSync'], ['#btnFxOff', 'fxOff'], ['#btnVintage', 'vintageEq'], ['#btnTapeSat', 'tapeSat']].forEach(([id, key]) => click(id, () => {
    state.settings[key] = !state.settings[key];
    if (eng) eng.applyMix();
    refreshButtons();
  }));
  click('#modSharp', () => { state.sharp = !(state.sharp && !state.flat); state.flat = false; updateMods(); });
  click('#modFlat', () => { state.flat = !(state.flat && !state.sharp); state.sharp = false; updateMods(); });
  click('#modSus', () => { ensureAudio(); setSustain(!state.sustain); });

  // Keyboard shortcuts side panel (desktop). Hidden by default; KEYS ? or the ? key toggles it.
  const shortcuts = $('#shortcuts');
  function toggleShortcuts(on = shortcuts.hidden) {
    shortcuts.hidden = !on;
    $('#btnHelp').classList.toggle('on', on);
    $('#btnHelp').setAttribute('aria-expanded', String(on));
    if (on) placeShortcuts();
  }

  // Sit beside the synth if there's room; otherwise float over its right edge.
  // The app itself never moves.
  function placeShortcuts() {
    if (shortcuts.hidden) return;
    const synth = $('.synth').getBoundingClientRect();
    const room = window.innerWidth - synth.right - 16 - 16;
    const beside = room >= 250;
    shortcuts.classList.toggle('beside', beside);
    shortcuts.style.left = beside ? `${synth.right + 16}px` : '';
    shortcuts.style.width = beside ? `${Math.min(300, room)}px` : '';
    // when floating over the app, start below the header so the KEYS button stays reachable
    const headerBottom = $('.top').getBoundingClientRect().bottom;
    shortcuts.style.top = beside ? '' : `${Math.max(16, headerBottom + 10)}px`;
    shortcuts.style.maxHeight = beside ? '' : `calc(100vh - ${Math.max(16, headerBottom + 10) + 16}px)`;
  }
  window.addEventListener('resize', placeShortcuts);
  click('#btnHelp', () => toggleShortcuts());

  /* ---------------- settings ---------------- */
  const settingsDlg = $('#settings');
  // Colour schemes (see the theme blocks at the end of style.css).
  const THEMES = [
    { id: 'cream', name: 'Studio Cream', era: '70s European', sw: ['#eeeae1', '#2d2c2a', '#e2562b', '#161714'] },
    { id: 'walnut', name: 'Walnut & Black', era: '70s modular', sw: ['#4a3222', '#1d1c1b', '#c9c6bf', '#f08a24'] },
    { id: 'silver', name: 'Silver Poly', era: 'Early 80s', sw: ['#d8dadd', '#2a2d31', '#d6372b', '#120d0d'] },
    { id: 'navy', name: 'Digital Navy', era: 'Mid 80s', sw: ['#1a2332', '#3a4a66', '#35c4ca', '#9ee667'] },
    { id: 'avocado', name: 'Avocado', era: '70s', sw: ['#e9e1c6', '#4a5230', '#d4951c', '#6b6638'] },
    { id: 'rack', name: 'Rack Black', era: '80s rack', sw: ['#161618', '#303035', '#ff2e2e', '#e9e9ea'] },
  ];
  function applyTheme(id) {
    const t = THEMES.find((x) => x.id === id) ? id : 'cream';
    if (t === 'cream') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    readPalette();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
    lastLit = null;
  }
  // Background: one of the current scheme's colours, stored by role so it follows scheme changes.
  const BG_CHOICES = [
    ['bg', 'Scheme default'], ['panel', 'Panel'], ['panel-2', 'Buttons'], ['cap', 'Knobs'],
    ['accent', 'Accent'], ['glass', 'Display'], ['ink', 'Lettering'], ['edge', 'Edges'],
    ['white', 'White'], ['black', 'Black'], // fixed colours, the same in every scheme
  ];
  const FIXED_BG = { white: '#ffffff', black: '#000000' };
  const bgValue = (t) => FIXED_BG[t] || `var(--${t})`;
  function applyBackground(token) {
    const t = BG_CHOICES.some(([k]) => k === token) ? token : 'bg';
    if (t === 'bg') document.documentElement.style.removeProperty('--page-bg');
    else document.documentElement.style.setProperty('--page-bg', bgValue(t));
  }
  function renderBackgrounds() {
    const row = $('#bgRow'), cs = getComputedStyle(document.documentElement);
    row.querySelectorAll('.bg-opt').forEach((b) => b.remove());
    for (const [token, name] of BG_CHOICES) {
      const b = document.createElement('button');
      b.className = 'bg-opt' + ((prefs.background || 'bg') === token ? ' on' : '');
      b.style.background = FIXED_BG[token] || cs.getPropertyValue('--' + token).trim();
      b.title = name;
      b.setAttribute('aria-label', `Background: ${name}`);
      b.addEventListener('click', () => {
        prefs.background = token;
        savePrefs();
        applyBackground(token);
        renderBackgrounds();
      });
      row.appendChild(b);
    }
  }

  const themeGrid = $('#themeGrid');
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'theme-opt';
    b.dataset.id = t.id;
    b.innerHTML = `<span class="sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${t.name}<small>${t.era}</small>`;
    b.addEventListener('click', () => {
      prefs.theme = t.id;
      savePrefs();
      applyTheme(t.id);
      renderSettings();
    });
    themeGrid.appendChild(b);
  });

  const fontGrid = $('#fontGrid');
  FONTS.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'theme-opt font-opt';
    b.dataset.id = f.id;
    b.innerHTML = `<span class="sample" style='font-family:${f.css}'>cs—10 Aa</span>${f.name}<small>${f.era}</small>`;
    b.addEventListener('click', () => {
      prefs.font = f.id;
      savePrefs();
      applyFont(f.id);
      document.fonts.ready.then(readPalette); // canvas labels pick up the new face
      renderSettings();
    });
    fontGrid.appendChild(b);
  });

  function renderSettings() {
    renderBackgrounds(); // swatches show the current scheme's colours
    FONTS.forEach(loadFontFile); // so each option previews in its own typeface
    [...fontGrid.children].forEach((b) => b.classList.toggle('on', b.dataset.id === (prefs.font || 'michroma')));
    [...themeGrid.children].forEach((b) => b.classList.toggle('on', b.dataset.id === (prefs.theme || 'cream')));
    $('#exportFolderName').textContent = exportDir ? exportDir.name : 'Downloads';
    $('#chooseFolder').disabled = !canPickFolder;
    $('#resetFolder').disabled = !exportDir;
    $('#exportFolderHint').textContent = canPickFolder
      ? 'Exports are saved straight into this folder. The browser asks for permission once per session.'
      : 'This browser always saves to its Downloads folder. Choosing a folder needs Chrome or Edge on desktop.';
    $('#filePrefix').value = prefs.filePrefix;
    $('#exportFormat').value = prefs.exportFormat;
    const ps = $('#promptSave');
    ps.disabled = !canSaveAs;
    ps.classList.toggle('on', canSaveAs && prefs.promptSave);
    ps.setAttribute('aria-pressed', String(canSaveAs && prefs.promptSave));
    $('#promptSaveLbl').textContent = canSaveAs && prefs.promptSave ? 'On' : 'Off';
    $('#promptSaveHint').textContent = canSaveAs
      ? 'Each export opens a Save dialog, starting in the export folder above, so you can choose the name and place.'
      : 'Needs Chrome or Edge on desktop. In this browser, your browser’s own download settings decide.';
    $('#filePrefixExample').textContent = takeFileName('wav');
  }
  click('#btnSettings', () => { renderSettings(); renderMidi(); settingsDlg.showModal(); });
  click('#midiInd', () => {
    ensureAudio(); // the click also unlocks audio
    if (midiAccess) { renderSettings(); renderMidi(); settingsDlg.showModal(); }
    else enableMidi();
  });
  click('#midiConnect', () => { ensureAudio(); enableMidi(); });
  click('#midiToggle', () => {
    prefs.midiOff = !prefs.midiOff;
    savePrefs();
    if (prefs.midiOff) disableMidi();
    renderMidi();
  });

  // Keys / Chords + arpeggiator controls
  click('#modeKeys', () => setPlayMode('keys'));
  click('#modeChords', () => setPlayMode('chords'));
  click('#arpOn', () => { releaseChords(); prefs.arpOn = !prefs.arpOn; savePrefs(); renderPlayMode(); });
  click('#arpLatch', () => { releaseChords(); prefs.arpLatch = !prefs.arpLatch; savePrefs(); renderPlayMode(); });
  [['#arpRate', 'arpRate'], ['#arpPattern', 'arpPattern'], ['#arpOctaves', 'arpOctaves']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      prefs[key] = key === 'arpOctaves' ? Number(e.target.value) : e.target.value;
      savePrefs();
      if (arpRun) arpRun.seq = arpSeq(arpRun.notes); // takes effect on the next step
      e.target.blur();
    });
  });
  window.matchMedia('(max-width: 600px)').addEventListener('change', () => { renderPlayMode(); if (!prefs.chordKey) renderChordGrid(); });
  click('#midiTest', () => { ensureAudio(); settingsDlg.close(); openMonitor(); });
  click('#monClose', () => midiMon.close());
  click('#monReset', () => { monSeen.clear(); monHeld.clear(); monLog = []; renderMonitor(); });
  midiMon.addEventListener('click', (e) => { if (e.target === midiMon) midiMon.close(); });
  $('#midiInput').addEventListener('change', (e) => { prefs.midiInput = e.target.value; savePrefs(); bindMidiInputs(); renderMidi(); });
  // MIDI notes can't unlock audio by themselves, so the first click anywhere does
  document.addEventListener('pointerdown', () => { if (prefs.midiEnabled || midiAccess) ensureAudio(); }, { once: true });
  // Reconnect automatically if MIDI was set up before (no prompt once the browser has allowed it)
  if (midiSupported && prefs.midiEnabled && !prefs.midiOff) enableMidi();
  else renderMidi();
  click('#settingsClose', () => settingsDlg.close());
  settingsDlg.addEventListener('click', (e) => { if (e.target === settingsDlg) settingsDlg.close(); });
  click('#chooseFolder', async () => {
    try { await chooseExportDir(); } catch (e) { /* picker cancelled */ }
    renderSettings();
  });
  click('#resetFolder', async () => { await clearExportDir(); renderSettings(); });
  $('#filePrefix').addEventListener('input', (e) => {
    prefs.filePrefix = e.target.value;
    savePrefs();
    $('#filePrefixExample').textContent = takeFileName('wav');
  });
  click('#promptSave', () => { prefs.promptSave = !prefs.promptSave; savePrefs(); renderSettings(); });
  $('#exportFormat').addEventListener('change', (e) => { prefs.exportFormat = e.target.value; savePrefs(); });
  click('#resetSettings', async () => {
    if (!window.confirm('Reset all settings to their defaults?')) return;
    resetPrefs();
    applyTheme(prefs.theme);
    applyBackground(prefs.background);
    applyFont(prefs.font);
    readPalette();
    await clearExportDir();
    renderSettings();
  });
  loadExportDir().then(renderSettings);
  click('#shortcutsClose', () => toggleShortcuts(false));

  // Light up the matching line in the panel when a shortcut is pressed.
  function flashShortcut(e) {
    if (shortcuts.hidden) return;
    const code = e.key === '?' ? 'Slash' : e.code;
    for (const row of shortcuts.querySelectorAll('[data-codes]')) {
      if (!row.dataset.codes.split(' ').includes(code)) continue;
      row.classList.remove('flash');
      void row.offsetWidth; // restart the animation
      row.classList.add('flash');
    }
  }

  // iPhone / iPad: mention the silent switch (older iOS mutes web audio with it)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('#iosHint').hidden = !isIOS;

  // Small per-track dials: drag up/down or scroll; double-click resets to 12 o'clock.
  function miniDial(el, { key, min, max, def, label }) {
    const cap = el.querySelector('.cap');
    const toNorm = (v) => (v - min) / (max - min);
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    const set = (n) => {
      n = Math.max(0, Math.min(1, n));
      const v = min + n * (max - min);
      state.settings[key] = v;
      cap.style.setProperty('--rot', `${-135 + n * 270}deg`);
      el.title = `${label(v)} · drag · double-click resets`;
      el.setAttribute('aria-label', label(v));
      if (eng) eng.applyMix();
    };
    set(toNorm(state.settings[key]));
    keyAdjust(el, () => toNorm(state.settings[key]), set);
    el.addEventListener('mousedown', (e) => e.preventDefault());
    let startY = 0, startN = 0;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); startY = e.clientY; startN = toNorm(state.settings[key]); });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) set(startN + (startY - e.clientY) / (e.shiftKey ? 600 : 150));
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); set(toNorm(state.settings[key]) - e.deltaY / 1500); }, { passive: false });
    el.addEventListener('dblclick', () => set(toNorm(def)));
  }

  // Vol / Pan dials: Track 1 (vol1/pan1), Track 2 (vol2/pan2) and Rhythm (vol3/pan3).
  [[1, '1', 'Track 1'], [2, '2', 'Track 2'], [3, 'R', 'Rhythm']].forEach(([n, id, name]) => {
    miniDial($('#vol' + id), {
      key: 'vol' + n, min: 0, max: 1, def: 0.5,
      label: (v) => `${name} volume: ${Math.round(trackVolGain(v) * 100)}%`,
    });
    miniDial($('#pan' + id), {
      key: 'pan' + n, min: -1, max: 1, def: 0,
      label: (v) => `${name} pan: ${Math.abs(v) < 0.02 ? 'centre' : Math.round(Math.abs(v) * 100) + '% ' + (v < 0 ? 'left' : 'right')}`,
    });
  });

  /* ---------------- drawing ---------------- */
  // Canvas colours come from the current colour scheme's CSS tokens.
  let pal = {};
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    pal = { ink: v('--ink'), muted: v('--muted'), accent: v('--accent'), track2: v('--track2'), glassInk: v('--glass-ink'), font: v('--font') };
  }
  const alpha = (hex, a) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  readPalette();

  const scope = $('#scope'), sctx = scope.getContext('2d');
  const tape = $('#tape'), tctx = tape.getContext('2d');
  let scopeData = null;

  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, dpr };
  }

  function drawScope() {
    const { w, h, dpr } = fit(scope);
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = alpha(pal.glassInk, 0.08);
    sctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const x = (w * i) / 8; sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, h); sctx.stroke(); }
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();

    sctx.strokeStyle = pal.glassInk;
    sctx.lineWidth = 1.5 * dpr;
    sctx.shadowColor = alpha(pal.glassInk, 0.7);
    sctx.shadowBlur = 6 * dpr;
    sctx.beginPath();
    if (eng) {
      if (!scopeData) scopeData = new Float32Array(eng.analyser.fftSize);
      eng.analyser.getFloatTimeDomainData(scopeData);
      // find a rising zero crossing so the trace stands still
      let s = 0;
      for (let i = 1; i < scopeData.length / 2; i++) if (scopeData[i - 1] < 0 && scopeData[i] >= 0) { s = i; break; }
      const n = 1024;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = h / 2 - scopeData[s + i] * h * 0.9;
        i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
      }
    } else {
      sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2);
    }
    sctx.stroke();
    sctx.shadowBlur = 0;
  }

  // The tape shows a thin rhythm lane on top and one lane per track below it.
  function drawTape(now) {
    const { w, h, dpr } = fit(tape);
    tctx.clearRect(0, 0, w, h);
    const rh = 26 * dpr, laneH = (h - rh) / 2;
    const laneTop = (i) => rh + i * laneH;

    let tracks = [[], []], hits = [], len, head = null;
    const live = (n, el) => ({ ...n, end: n.end === null ? el : n.end });
    if (rec && rec.mode === 'main') {
      const el = Math.max(0, now - rec.t0);
      tracks[0] = rec.notes.map((n) => live(n, el));
      hits = rec.hits.filter((x) => x.t <= el);
      len = Math.max(10, el * 1.15);
      head = el;
    } else if (take) {
      hits = take.hits; len = take.length;
      if (rec && rec.track === RHYTHM) { // drums being re-recorded: old hits out, new ones in as they play
        const el = Math.max(0, now - rec.t0);
        hits = take.hits.filter((h) => !h.inst).concat(rec.hits.filter((h) => h.inst && h.t <= el));
      }
      if (state.mute[RHYTHM]) hits = hits.filter((h) => !h.inst);
      // the lane being recorded shows its old notes faded: they'll be replaced
      tracks = take.tracks.map((t, i) => (t || []).map((n) => ({ ...n, muted: state.mute[i], ghost: !!rec && rec.track === i })));
      if (rec) {
        const el = Math.max(0, now - rec.t0);
        if (rec.track !== RHYTHM) tracks[rec.track] = tracks[rec.track].concat(rec.notes.map((n) => live(n, el)));
      }
      if (playing) head = Math.min(Math.max(0, now - playing.T), len);
    } else {
      len = null;
    }

    // armed lane tint, lane separators
    const target = rec ? rec.track : monitorTrack();
    tctx.fillStyle = rec ? alpha(pal.accent, .10) : alpha(pal.accent, .05);
    if (target === 0 || target === 1) tctx.fillRect(0, laneTop(target), w, laneH);
    else if (target === RHYTHM) tctx.fillRect(0, 0, w, rh);
    tctx.fillStyle = alpha(pal.muted, .45);
    tctx.fillRect(0, rh - dpr, w, dpr);
    tctx.fillRect(0, laneTop(1) - dpr / 2, w, dpr);
    // lane labels
    tctx.font = `${7 * dpr}px ${pal.font}`;
    tctx.textBaseline = 'middle';
    tctx.fillStyle = pal.muted;
    tctx.fillText('R', 8 * dpr, rh / 2);
    tctx.fillStyle = pal.ink; tctx.fillText('1', 8 * dpr, laneTop(0) + laneH / 2);
    tctx.fillStyle = pal.track2; tctx.fillText('2', 8 * dpr, laneTop(1) + laneH / 2);
    tctx.textBaseline = 'alphabetic';
    if (len === null) return;

    const pad = 8 * dpr, left = 22 * dpr;
    const X = (t) => left + (t / len) * (w - left - pad);

    // time markers: labels in the rhythm lane, faint lines through the track lanes
    tctx.font = `${7 * dpr}px Michroma, Helvetica, Arial, sans-serif`;
    const step = len > 120 ? 30 : len > 40 ? 10 : len > 15 ? 5 : 1;
    for (let s = 0; s <= len; s += step) {
      tctx.fillStyle = alpha(pal.muted, .22);
      tctx.fillRect(X(s), rh, 1, h - rh);
      tctx.fillStyle = pal.muted;
      tctx.fillText(s + 's', X(s) + 3 * dpr, 9 * dpr);
    }

    // drums: hit ticks in the rhythm lane, bar lines through every lane
    for (const x of hits) {
      if (x.beat === 0) { tctx.fillStyle = alpha(pal.ink, .28); tctx.fillRect(X(x.t), 12 * dpr, dpr, h - 12 * dpr); }
      if (x.inst) {
        const big = x.inst === 'kick' || x.inst === 'snare';
        tctx.fillStyle = big ? alpha(pal.ink, .8) : alpha(pal.ink, .35);
        const th = (big ? 10 : 5) * dpr;
        tctx.fillRect(X(x.t), rh - 3 * dpr - th, 1.5 * dpr, th);
      }
    }

    // notes, each track scaled to its own lane
    tracks.forEach((notes, i) => {
      if (!notes.length) return;
      let lo = Math.min(...notes.map((n) => n.midi)), hi = Math.max(...notes.map((n) => n.midi));
      if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
      const top = laneTop(i) + 6 * dpr, bottom = laneTop(i) + laneH - 6 * dpr;
      const rowH = Math.max(2 * dpr, Math.min(5 * dpr, (bottom - top) / (hi - lo + 1)));
      for (const n of notes) {
        const y = bottom - ((n.midi - lo) / (hi - lo)) * (bottom - top - rowH) - rowH;
        const active = head !== null && head >= n.start && head < n.end && !n.muted && !n.ghost;
        tctx.fillStyle = active ? pal.accent : i === 1 ? pal.track2 : pal.ink;
        tctx.globalAlpha = n.ghost ? 0.15 : n.muted ? 0.2 : 1;
        tctx.fillRect(X(n.start), y, Math.max(2 * dpr, X(n.end) - X(n.start)), rowH);
      }
      tctx.globalAlpha = 1;
    });

    if (head !== null) {
      tctx.fillStyle = pal.accent;
      tctx.fillRect(X(head) - dpr / 2, 0, 1.5 * dpr, h);
    }
  }

  let lastLit = '';
  function drawKeys(now) {
    const lit = new Set();
    for (const e of held.values()) lit.add(e.midi);
    for (const e of sustained) lit.add(e.midi);
    if (playing && take) {
      const pos = now - playing.T;
      for (const n of audibleNotes(playing.skip)) if (pos >= n.start && pos < n.end) lit.add(n.midi);
    }
    const base = 12 * (kbBase() + 1);
    const key = base + ':' + [...lit].sort((x, y) => x - y).join(',');
    if (key === lastLit) return;
    lastLit = key;
    for (const { el, offset } of keyEls) el.classList.toggle('on', lit.has(base + offset));
  }

  function drawBeatLamp(now) {
    flashes = flashes.filter((f) => f.t > now - 0.5);
    const f = flashes.filter((x) => x.t <= now && now - x.t < 0.09).pop();
    for (const lamp of [$('#beatLamp'), $('#psBeat')]) {
      lamp.classList.toggle('on', !!f);
      lamp.classList.toggle('accent', !!f && f.accent);
    }
  }

  function frame() {
    const now = ctx ? ctx.currentTime : 0;
    drawScope();
    drawTape(now);
    drawKeys(now);
    drawBeatLamp(now);
    if (rec) {
      if (now < rec.t0 && rec.countIn) {
        setStatus(`Count-in · ${Math.ceil((rec.t0 - now) / beatDur() - 0.001)}`, 'rec');
        $('#rTime').textContent = fmtTime(0);
      } else {
        if (!rec.live) { rec.live = true; setStatus(`Recording · ${trackName(rec.track)}`, 'rec'); }
        $('#rTime').textContent = fmtTime(now - rec.t0);
      }
    } else if (playing) {
      $('#rTime').textContent = fmtTime(Math.min(now - playing.T, take.length));
    }
    requestAnimationFrame(frame);
  }

  applyTheme(prefs.theme);
  applyBackground(prefs.background);
  renderChordGrid();
  renderPlayMode();
  selectPreset(0);
  setOctave(4);
  refreshRhythm();
  refreshButtons();
  requestAnimationFrame(frame);
})();
