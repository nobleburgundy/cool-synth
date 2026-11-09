(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
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
    settings: { tone: 1, attack: 1, release: 1, echo: 0.3, space: 0.55, volume: 0.5, bpm: 92, drums: 0.7, drumFxBypass: true, vol1: 0.5, vol2: 0.5, pan1: 0, pan2: 0, vintageEq: false, tapeSat: false },
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

  function noteDown(id, midi, name) {
    ensureAudio();
    if (held.has(id)) return;
    const now = ctx.currentTime;
    // live notes play through the volume of the track they'd be recorded into
    const voice = eng.noteOn(state.preset, midi, now, monitorTrack());
    let recNote = null;
    if (recording(now) && rec.track !== RHYTHM) {
      recNote = { midi, preset: state.preset.id, start: now - rec.t0, end: null };
      rec.notes.push(recNote);
    }
    held.set(id, { voice, midi, presetId: state.preset.id, recNote });
    $('#rNote').textContent = name;
  }

  function noteUp(id) {
    const e = held.get(id);
    if (!e) return;
    held.delete(id);
    if (state.sustain) sustained.push(e);
    else releaseEntry(e);
  }

  function releaseEntry(e) {
    const now = ctx.currentTime;
    e.voice.release(now);
    if (e.recNote && e.recNote.end === null && rec) e.recNote.end = now - rec.t0;
  }

  function setSustain(on) {
    state.sustain = on;
    $('#modSus').classList.toggle('on', on);
    $('#modSus').setAttribute('aria-pressed', String(on));
    if (!on) { sustained.forEach(releaseEntry); sustained = []; }
  }

  function releaseAll() {
    for (const id of [...held.keys()]) noteUp(id);
    setSustain(false);
    state.sharp = state.flat = false;
    updateMods();
  }

  /* ---------------- rhythm box ---------------- */
  function scheduleDrums() {
    if (!ctx) return;
    const now = ctx.currentTime, horizon = now + AHEAD;

    if (drumTrack) {
      // if the tab was asleep, skip ahead instead of firing a burst of hits
      if (drumTrack.nextTime < now - 0.2) drumTrack.nextTime = now + 0.05;
      while (drumTrack.nextTime < horizon) playStep(drumTrack);
    }

    for (const q of queues) {
      while (q.i < q.ev.length && q.ev[q.i].t < horizon) {
        const e = q.ev[q.i++];
        if (e.inst) eng.drum(e.inst, e.t, e.vel);
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
      eng.drum(h.inst, t, h.vel);
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

  function schedulePass(T, skip) {
    for (const n of audibleNotes(skip)) {
      const v = eng.noteOn(presetById(n.preset), n.midi, T + n.start, n.track);
      v.release(T + n.end);
      playing.voices.push(v);
    }
    const hits = skip === RHYTHM ? [] : take.hits.filter((h) => !h.inst || !state.mute[RHYTHM]);
    if (hits.length) queues.push({ ev: hits.map((h) => ({ ...h, t: T + h.t })), i: 0, tag: 'play' });
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
    playing = null;
    setStatus(takeLabel());
    refreshButtons();
  }

  function stopAll() {
    if (rec) stopRecording();
    stopPlayback();
    stopDrums();
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
      if (playing.next === null && now > end - 0.3) { playing.next = end; schedulePass(end); }
    } else if (now >= end) {
      // let the release tails ring out naturally
      playing = null;
      setStatus(takeLabel());
      refreshButtons();
      return;
    }
    if (playing.voices.length > 200) playing.voices = playing.voices.filter((v) => !v.done);
  }

  async function exportTake() {
    if (!take || exporting) return;
    if (rec) stopRecording();
    exporting = true;
    setStatus('Rendering WAV…');
    refreshButtons();
    try {
      const hits = state.mute[RHYTHM] ? [] : take.hits;
      const blob = await renderTakeToWav({ notes: audibleNotes(), hits, length: take.length }, state.settings);
      const name = takeFileName('wav');
      download(blob, name);
      setStatus(`Exported ${name}`);
    } catch (err) {
      console.error(err);
      setStatus('Export failed');
    }
    exporting = false;
    refreshButtons();
  }

  function takeFileName(ext) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `cs10-take-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // MIDI: both tracks (unless muted) plus the drums, at the take's tempo and meter.
  function exportMidi() {
    if (!take) return;
    if (rec) stopRecording();
    try {
      const timing = takeTiming(take, bpm(), state.ts);
      const tracks = [0, 1].map((i) => ({
        name: `Track ${i + 1}`,
        channel: i,
        notes: take.tracks[i] && !state.mute[i] ? take.tracks[i] : [],
      }));
      const blob = buildMidi({ tracks, hits: state.mute[RHYTHM] ? [] : take.hits, ...timing, title: 'cs-10 take' });
      const name = takeFileName('mid');
      download(blob, name);
      setStatus(`Exported ${name}`);
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
    $('#btnUndo').disabled = !undoSnap || !!rec;
    $('#btnImport').disabled = !!rec;
    $('#btnUndo').title = undoSnap ? `Undo the last ${undoSnap.what} (⌘Z / Ctrl+Z)` : 'Nothing to undo';
    $('#btnQuant').disabled = !canQuantize();
    $('#btnQuant').title = canQuantize()
      ? 'Snap notes to the recorded drum grid (Q)'
      : 'Record with the Rhythm running to use Quantize';
    $('#drumsLabel').textContent = drumTrack ? 'Stop' : 'Start';
    $('#btnQuant').classList.toggle('on', canQuantize() && state.quant > 0);
    $('#btnQuant').querySelector('small').textContent = QUANT[state.quant].label;
    $('#btnPlay').classList.toggle('on', !!playing);
    $('#btnLoop').classList.toggle('on', state.loop);
    $('#btnExport').classList.toggle('on', exporting);
    $('#btnPlay').disabled = !take;
    $('#btnExport').disabled = !take || exporting;
    $('#btnMidi').disabled = !take;
    $('#tapeEmpty').style.display = take || rec ? 'none' : '';
    $('#btnDrums').classList.toggle('on', !!drumTrack);
    $('#btnCount').classList.toggle('on', state.countIn);
    $('#btnFxBypass').classList.toggle('on', state.settings.drumFxBypass);
    [['#btnVintage', 'vintageEq'], ['#btnTapeSat', 'tapeSat']].forEach(([id, key]) => {
      $(id).classList.toggle('on', state.settings[key]);
      $(id).setAttribute('aria-pressed', String(state.settings[key]));
    });
  }

  function refreshRhythm() {
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
  }

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
    { key: 'bpm', label: 'Tempo', min: 40, max: 200, fmt: (v) => Math.round(v) + ' bpm', accent: true, editable: true, onChange: () => refreshRhythm() },
    { key: 'drums', label: 'Level', min: 0, max: 1, fmt: (v) => Math.round(v * 100) + '%' },
  ];

  function tickSvg() {
    let s = '<svg viewBox="0 0 72 72">';
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      const r1 = 33, r2 = i % 5 === 0 ? 28.5 : 30.5;
      const x1 = 36 + Math.sin(a) * r1, y1 = 36 - Math.cos(a) * r1;
      const x2 = 36 + Math.sin(a) * r2, y2 = 36 - Math.cos(a) * r2;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6b675e" stroke-width="${i % 5 === 0 ? 1.4 : 1}" stroke-linecap="round"/>`;
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
    knobsEl.appendChild(g);
  });

  /* ---------------- UI: rhythm box ---------------- */
  const rhythmKnobs = RHYTHM_KNOBS.map((cfg) => $('#rhythmKnobs').appendChild(buildKnob(cfg)));
  const tempoKnob = rhythmKnobs[0];

  const nudgeTempo = (d) => tempoKnob.setValue(Math.round(tempoKnob.getValue()) + d);
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
    noteDown('ptr' + e.pointerId, midi, k.dataset.name + Math.floor(midi / 12 - 1));
  });
  const ptrUp = (e) => noteUp('ptr' + e.pointerId);
  kb.addEventListener('pointerup', ptrUp);
  kb.addEventListener('pointercancel', ptrUp);

  /* ---------------- computer keyboard ---------------- */
  const typing = (e) => e.target instanceof HTMLInputElement && e.target.type !== 'range';

  document.addEventListener('keydown', (e) => {
    if (typing(e)) return;
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
    if (e.repeat) { if (/^Key[A-G]$/.test(c)) e.preventDefault(); return; }

    const m = /^Key([A-G])$/.exec(c);
    if (m) {
      e.preventDefault();
      const L = m[1];
      const acc = state.sharp && !state.flat ? 1 : state.flat && !state.sharp ? -1 : 0;
      const midi = 12 * (octave() + 1) + NOTE_PC[L] + acc;
      noteDown(c, midi, L + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + octave());
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
    if (c === 'Space') { setSustain(false); return; }
    if (/^Key[A-G]$/.test(c)) noteUp(c);
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
  [['#btnVintage', 'vintageEq'], ['#btnTapeSat', 'tapeSat']].forEach(([id, key]) => click(id, () => {
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

  [1, 2].forEach((n) => {
    miniDial($('#vol' + n), {
      key: 'vol' + n, min: 0, max: 1, def: 0.5,
      label: (v) => `Track ${n} volume: ${Math.round(trackVolGain(v) * 100)}%`,
    });
    miniDial($('#pan' + n), {
      key: 'pan' + n, min: -1, max: 1, def: 0,
      label: (v) => `Track ${n} pan: ${Math.abs(v) < 0.02 ? 'centre' : Math.round(Math.abs(v) * 100) + '% ' + (v < 0 ? 'left' : 'right')}`,
    });
  });

  /* ---------------- drawing ---------------- */
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
    sctx.strokeStyle = 'rgba(242,165,60,.08)';
    sctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const x = (w * i) / 8; sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, h); sctx.stroke(); }
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();

    sctx.strokeStyle = '#f2a53c';
    sctx.lineWidth = 1.5 * dpr;
    sctx.shadowColor = 'rgba(242,165,60,.7)';
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
    tctx.fillStyle = rec ? 'rgba(226,86,43,.10)' : 'rgba(226,86,43,.05)';
    if (target === 0 || target === 1) tctx.fillRect(0, laneTop(target), w, laneH);
    else if (target === RHYTHM) tctx.fillRect(0, 0, w, rh);
    tctx.fillStyle = 'rgba(138,133,122,.45)';
    tctx.fillRect(0, rh - dpr, w, dpr);
    tctx.fillRect(0, laneTop(1) - dpr / 2, w, dpr);
    // lane labels
    tctx.font = `${7 * dpr}px Michroma, Helvetica, Arial, sans-serif`;
    tctx.textBaseline = 'middle';
    tctx.fillStyle = '#6b675e';
    tctx.fillText('R', 8 * dpr, rh / 2);
    tctx.fillStyle = '#2d2c2a'; tctx.fillText('1', 8 * dpr, laneTop(0) + laneH / 2);
    tctx.fillStyle = '#4f7a8c'; tctx.fillText('2', 8 * dpr, laneTop(1) + laneH / 2);
    tctx.textBaseline = 'alphabetic';
    if (len === null) return;

    const pad = 8 * dpr, left = 22 * dpr;
    const X = (t) => left + (t / len) * (w - left - pad);

    // time markers: labels in the rhythm lane, faint lines through the track lanes
    tctx.font = `${7 * dpr}px Michroma, Helvetica, Arial, sans-serif`;
    const step = len > 120 ? 30 : len > 40 ? 10 : len > 15 ? 5 : 1;
    for (let s = 0; s <= len; s += step) {
      tctx.fillStyle = 'rgba(138,133,122,.22)';
      tctx.fillRect(X(s), rh, 1, h - rh);
      tctx.fillStyle = '#6b675e';
      tctx.fillText(s + 's', X(s) + 3 * dpr, 9 * dpr);
    }

    // drums: hit ticks in the rhythm lane, bar lines through every lane
    for (const x of hits) {
      if (x.beat === 0) { tctx.fillStyle = 'rgba(45,44,42,.28)'; tctx.fillRect(X(x.t), 12 * dpr, dpr, h - 12 * dpr); }
      if (x.inst) {
        const big = x.inst === 'kick' || x.inst === 'snare';
        tctx.fillStyle = big ? 'rgba(45,44,42,.8)' : 'rgba(45,44,42,.35)';
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
        tctx.fillStyle = active ? '#e2562b' : i === 1 ? '#4f7a8c' : '#2d2c2a';
        tctx.globalAlpha = n.ghost ? 0.15 : n.muted ? 0.2 : 1;
        tctx.fillRect(X(n.start), y, Math.max(2 * dpr, X(n.end) - X(n.start)), rowH);
      }
      tctx.globalAlpha = 1;
    });

    if (head !== null) {
      tctx.fillStyle = '#e2562b';
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
    const lamp = $('#beatLamp');
    lamp.classList.toggle('on', !!f);
    lamp.classList.toggle('accent', !!f && f.accent);
  }

  function frame() {
    const now = ctx ? ctx.currentTime : 0;
    updatePlayback(now);
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

  selectPreset(0);
  setOctave(4);
  refreshRhythm();
  refreshButtons();
  requestAnimationFrame(frame);
})();
