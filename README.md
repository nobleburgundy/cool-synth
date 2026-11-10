# cs—10 Ambient Synthesizer

A polyphonic browser synth with a rhythm box and a three-track tape, for ambient sketches. Plain HTML/CSS/JS on the Web Audio API: no build step, no dependencies, nothing saved.

**Run:** open `index.html`, or serve the folder from GitHub Pages. On a phone it becomes just the rhythm box.

## Keys

| Key | Action |
| --- | --- |
| `A`–`G` | notes (hold `+` / `−` for sharp / flat) |
| `W` / `V` | E♭ (D♯) / B♭ (A♯) |
| `↑` / `↓`, `Z` / `X` | octave up / down |
| `Space` | sustain |
| `1`–`0`, `Shift`+`1`–`4` | choose sound |
| `T` | rhythm start / stop |
| `R` / `P` / `L` / `Esc` | record / play / loop / stop |
| `Q` | quantize (off → 1/16 → 1/8) |
| `⌘Z` / `Ctrl+Z` | undo last recording, clear or import |
| `?` | show / hide the shortcuts panel |

Knobs: drag or scroll (Shift = fine), double-click to reset. Double-click Tempo to type a BPM.

## Features

- **Sounds:** 14 presets: pads, keys and leads, two Mellotron-style tape sounds (wow and flutter, 8-second notes) and two vintage basses. **Vintage EQ** and **Tape Saturation** switches colour the synth, not the drums.
- **Echo & Space:** **Echo Sync** locks the echo to the tempo (a dotted eighth; otherwise 420 ms). **Bypass** turns Echo and Space fully off.
- **Chords:** switch the keyboard to **Chords** for 72 chord pads (Maj, Min, 7, Maj7, Min7, Sus2 across 12 roots, starting at C and going round the circle of fifths). **Arp** arpeggiates in time with the tempo (1/4 to 1/32, triplets; up, down, up-down, random; 1–2 octaves); **Latch** keeps a chord going. Shown on phones too, with a sound menu.
- **Rhythm box:** 6 patterns in 4/4, 3/4, 5/4 or 6/8, with tap tempo and an optional 1-bar count-in. Drums are dry unless FX Bypass is turned off.
- **Tape:** three tracks: Rhythm, Track 1 and Track 2. Arm a track (●) and press Rec. Recording over a take replaces only the armed track. Each track has **M** (mute) and **C** (clear), plus Vol and Pan dials.
- **Quantize:** snaps notes to the recorded drum grid. Your original timing is kept, so Off restores it.
- **Export:** **↓ Audio** saves a WAV (24-bit / 48 kHz, peak-safe, clean fade-out; 16-bit dithered in Settings); **↓ MIDI** saves a .mid file with Track 1, Track 2 and the drums on channel 10, at the take's tempo. Click the name tag on the tape (✎) to rename the take; exports use that name, otherwise `prefix-date-time`.
- **MIDI keyboard:** plug one in and click **MIDI** in the header (Chrome, Edge or Firefox). Velocity, sustain pedal, pitch bend (±2 semitones) and mod wheel (vibrato) all work; velocity is recorded and exported. The MIDI light shows when a keyboard is connected. If some keys don't play, open Settings → MIDI keyboard → **Test keyboard…** to see exactly which keys and messages arrive. Don't use MIDI? Switch it **Off** in Settings and the app never asks the browser for MIDI access.
- **Settings:** colour scheme, background colour (any colour from the scheme) and typeface (70s/80s synth styles), export folder, optional Save dialog for every export (starting in that folder), audio format and file name prefix, saved in this browser. The folder and Save dialog need Chrome / Edge; other browsers use Downloads.
- **Import:** a .mid file with up to 2 instrument tracks plus drums. Use the button, or drop the file onto the app.

## Files

`synth.js` sounds and audio engine · `drums.js` rhythm patterns · `midi.js` MIDI export and import · `settings.js` saved preferences · `fonts.js` typefaces · `app.js` UI, recording and playback · `style.css` styling · icons: `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png`
