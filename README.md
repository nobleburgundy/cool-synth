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
- **Chords:** switch the keyboard to **Chords** for 96 chord pads (Maj, Min, 7, Maj7, Min7, Sus2, Dim7, Aug7 across 12 roots, starting at C and going round the circle of fifths). **Arp** arpeggiates in time with the tempo (1/4 to 1/32, triplets; up, down, up-down, random; 1–2 octaves); **Latch** keeps a chord going. A **Key** menu swaps the full board for just the 7 chords of a key (triads, 7ths, sus chords, with degree numbers); in All chords, chips show or hide chord types. Shown on phones too (defaulting to C major), with a sound menu and a rhythm strip pinned to the top.
- **Rhythm box:** 6 patterns in 4/4, 3/4, 5/4 or 6/8, with tap tempo and an optional 1-bar count-in. Drums are dry unless FX Bypass is turned off.
- **Tape:** three tracks: Rhythm, Track 1 and Track 2. Arm a track (●) and press Rec. Recording over a take replaces only the armed track. Each track has **M** (mute) and **C** (clear), plus Vol and Pan dials.
- **Quantize:** snaps notes to the recorded drum grid. Your original timing is kept, so Off restores it.
- **Export audio** (↓ Audio) has four types:
  - **Master**: one finished file. Optional **Mix & master** (gentle EQ and compression on synths, drums and mix, then loudness to −16 / −14 / −18 LUFS with a −1 dBTP true-peak limiter).
  - **Stems**: one file per track and the drums, same length, in a .zip; with or without their reverb and echo.
  - **For mastering**: the unmastered mix, peaking at −6 dBFS, for a mastering engineer.
  - **Release pack**: master, CD version, MP3 preview, stems, MIDI, project file and a loudness report in one .zip.
  - Formats: WAV 24-bit (44.1 / 48 / 96 kHz), 32-bit float, 16-bit CD (dithered), FLAC 24/16-bit, MP3 320. Track details (title, artist, album, year, genre, copyright, ISRC, BPM) are embedded.
  - **Length**: loop the take (up to 16×), fade in/out, and choose the reverb tail. **Mono bass** makes everything below 120 Hz mono.
  - **Preview** plays the export before saving, with A/B against the original at matched loudness, and a loudness report (LUFS, LRA, true peak, stereo/mono checks).
- **↓ MIDI** saves a .mid file with Track 1, Track 2 and the drums on channel 10, at the take's tempo.
- **Projects**: **Save** (⌘S) writes a .cs10 file with the take and every setting; **Open** (⌘O) reopens it, or imports a MIDI file.
- **MIDI keyboard:** plug one in and click **MIDI** in the header (Chrome, Edge or Firefox). Velocity, sustain pedal, pitch bend (±2 semitones) and mod wheel (vibrato) all work; velocity is recorded and exported. The MIDI light shows when a keyboard is connected. If some keys don't play, open Settings → MIDI keyboard → **Test keyboard…** to see exactly which keys and messages arrive. Don't use MIDI? Switch it **Off** in Settings and the app never asks the browser for MIDI access.
- **Settings:** colour scheme, background colour (any colour from the scheme) and typeface (70s/80s synth styles), export folder, optional Save dialog for every export (starting in that folder), audio format and file name prefix, saved in this browser. The folder and Save dialog need Chrome / Edge; other browsers use Downloads.
- **Import MIDI:** a .mid file with up to 2 instrument tracks plus drums, via **Open** or by dropping it onto the app.

## Files

`synth.js` sounds and audio engine · `drums.js` rhythm patterns · `midi.js` MIDI export and import · `export.js` audio export (renders, encoders, loudness analysis) · `settings.js` saved preferences · `fonts.js` typefaces · `app.js` UI, recording and playback · `style.css` styling · icons: `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png`
