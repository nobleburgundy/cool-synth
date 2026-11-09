'use strict';

/* User preferences, saved in this browser.
   - Simple values live in localStorage under one key (add new ones to PREF_DEFAULTS).
   - The export folder is a File System Access handle, which can only be kept in
     IndexedDB, so it's stored there. Chrome / Edge only; other browsers use Downloads. */

const PREF_KEY = 'cs10.prefs';
const PREF_DEFAULTS = {
  filePrefix: 'cs10-take', // exports are named <prefix>-YYYYMMDD-HHMM.wav / .mid
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
