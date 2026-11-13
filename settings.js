'use strict';

/* User preferences, saved in this browser.
   - Simple values live in localStorage under one key (add new ones to PREF_DEFAULTS).
   - The export folder is a File System Access handle, which can only be kept in
     IndexedDB, so it's stored there. Chrome / Edge only; other browsers use Downloads. */

const PREF_KEY = 'cs10.prefs';
const PREF_DEFAULTS = {
  filePrefix: 'cs10-take', // exports are named <prefix>-YYYYMMDD-HHMM.wav / .mid
  exportFormat: 'wav24-48', // see FORMATS in export.js
  exView: 'simple',         // export window: 'simple' or 'advanced'
  exportKind: 'master',     // master | stems | premaster | pack
  exLoops: 1, exFadeIn: 0, exFadeOut: 0, exTail: 'full',
  monoBass: false,
  stemFx: 'wet',            // stems keep their reverb & echo ('wet') or not ('dry')
  metaArtist: '', metaAlbum: '', metaYear: '', metaGenre: 'Ambient', metaCopyright: '',
  promptSave: false,       // open a Save dialog for every export, starting in the export folder
  masterOn: false,         // audio export: apply the mix & master chain
  masterLufs: -16,         // its loudness target (−16 Apple/AES, −14 Spotify/YouTube, −18 most dynamic)
  theme: 'cream',          // colour scheme (see THEMES in app.js)
  background: 'bg',        // page background: one of the scheme's colours (a CSS token name)
  font: 'michroma',        // panel typeface (see FONTS in fonts.js)
  midiOff: false,          // MIDI switched off: never ask the browser, hide the MIDI light
  midiEnabled: false,      // reconnect the MIDI keyboard automatically
  midiInput: 'all',        // 'all' or a device name
  playMode: 'keys',        // 'keys' or 'chords' (phones always show chords)
  arpOn: false,
  arpLatch: false,
  arpRate: '1/8',          // 1/4 1/8 1/8T 1/16 1/16T 1/32
  arpPattern: 'up',        // up down updown random
  arpOctaves: 1,
  chordKey: null,          // 'all', '<pc>-major' or '<pc>-minor'; null = All on desktop, C major on phones
  chordHide: [],           // chord-type rows hidden in "All chords"
  drumEdits: {},           // edited rhythm patterns: { 'rhythmId|tsId': { spb, steps } } (see drums.js)
};

const prefs = (() => {
  try { return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch (e) { return { ...PREF_DEFAULTS }; }
})();

function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode etc.: keep in memory */ }
}

function resetPrefs() {
  Object.keys(prefs).forEach((k) => delete prefs[k]);
  Object.assign(prefs, PREF_DEFAULTS);
  try { localStorage.removeItem(PREF_KEY); } catch (e) {}
}

/* ---- tiny IndexedDB key/value store ---- */
function kvOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('cs10', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kvGet(key) {
  const db = await kvOpen();
  return new Promise((resolve, reject) => {
    const q = db.transaction('kv').objectStore('kv').get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function kvSet(key, value) {
  const db = await kvOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    if (value === undefined) tx.objectStore('kv').delete(key);
    else tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---- export folder ---- */
const canPickFolder = typeof window.showDirectoryPicker === 'function';
let exportDir = null; // FileSystemDirectoryHandle, or null for the browser's Downloads

async function loadExportDir() {
  if (!canPickFolder) return null;
  try { exportDir = (await kvGet('exportDir')) || null; } catch (e) { exportDir = null; }
  return exportDir;
}

async function chooseExportDir() {
  const handle = await window.showDirectoryPicker({ id: 'cs10-exports', mode: 'readwrite' });
  exportDir = handle;
  try { await kvSet('exportDir', handle); } catch (e) {}
  return handle;
}

async function clearExportDir() {
  exportDir = null;
  try { await kvSet('exportDir', undefined); } catch (e) {}
}

// Ask for write access (the browser asks once per session). Call this straight from
// a click so the permission prompt is allowed; returns null if there's no folder or no access.
async function writableExportDir() {
  if (!exportDir) return null;
  try {
    let p = await exportDir.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') p = await exportDir.requestPermission({ mode: 'readwrite' });
    return p === 'granted' ? exportDir : null;
  } catch (e) {
    return null;
  }
}

async function writeToDir(dir, name, blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/* ---- "prompt for save location" (Chrome / Edge) ---- */
const canSaveAs = typeof window.showSaveFilePicker === 'function';
const SAVE_TYPES = {
  wav: [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }],
  mid: [{ description: 'MIDI file', accept: { 'audio/midi': ['.mid', '.midi'] } }],
  flac: [{ description: 'FLAC audio', accept: { 'audio/flac': ['.flac'] } }],
  mp3: [{ description: 'MP3 audio', accept: { 'audio/mpeg': ['.mp3'] } }],
  zip: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
  cs10: [{ description: 'cs-10 project', accept: { 'application/json': ['.cs10'] } }],
};

// Opens the Save dialog in the export folder (or Downloads). Returns a file handle,
// or null if the person cancelled. Must be called straight from a click.
async function pickSaveFile(name, kind) {
  const opts = { suggestedName: name, types: SAVE_TYPES[kind] };
  try {
    return await window.showSaveFilePicker({ ...opts, startIn: exportDir || 'downloads' });
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    // the stored folder can't be used as a starting point (e.g. it was moved): start in Downloads
    try { return await window.showSaveFilePicker({ ...opts, startIn: 'downloads' }); }
    catch (err2) { if (err2 && err2.name === 'AbortError') return null; throw err2; }
  }
}

async function writeToHandle(fh, blob) {
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}
