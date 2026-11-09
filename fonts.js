'use strict';

/* Panel typefaces. Loaded in <head> so the saved choice applies before the page draws.
   Google Fonts are only fetched when a typeface is used (or previewed in Settings). */

const FALLBACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const FONTS = [
  { id: 'michroma', name: 'Wide Grotesk', era: '70s · Microgramma style', family: 'Michroma', gf: 'Michroma',
    css: `"Michroma", "Eurostile Extended", "Microgramma", "Eurostile", ${FALLBACK}` },
  { id: 'jost', name: 'Geometric', era: '70s · Futura style', family: 'Jost', gf: 'Jost:wght@400;500',
    css: `"Jost", "Futura", "Century Gothic", ${FALLBACK}` },
  { id: 'swiss', name: 'Swiss', era: '70s–80s · Helvetica style', family: 'Helvetica Neue', gf: null,
    css: FALLBACK },
  { id: 'condensed', name: 'Condensed', era: '80s · Eurostile condensed', family: 'Saira Semi Condensed', gf: 'Saira+Semi+Condensed:wght@400;500',
    css: `"Saira Semi Condensed", "Eurostile Condensed", "Arial Narrow", ${FALLBACK}` },
  { id: 'futurist', name: 'Futurist', era: '80s', family: 'Orbitron', gf: 'Orbitron:wght@400;500',
    css: `"Orbitron", ${FALLBACK}` },
  { id: 'digital', name: 'Digital', era: '80s rack · LCD', family: 'Share Tech Mono', gf: 'Share+Tech+Mono',
    css: `"Share Tech Mono", "Courier New", monospace` },
];

function loadFontFile(f) {
  if (!f.gf || document.getElementById('font-' + f.id)) return;
  const link = document.createElement('link');
  link.id = 'font-' + f.id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.gf.replace(/ /g, '+')}&display=swap`;
  document.head.appendChild(link);
}

function applyFont(id) {
  const f = FONTS.find((x) => x.id === id) || FONTS[0];
  loadFontFile(f);
  document.documentElement.style.setProperty('--font', f.css);
  if (f.id === 'michroma') delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = f.id;
  return f;
}

// apply the saved typeface straight away
try {
  const saved = JSON.parse(localStorage.getItem('cs10.prefs') || '{}').font;
  if (saved && saved !== 'michroma') applyFont(saved);
} catch (e) { /* storage unavailable: default typeface */ }
