# FloatLoops

A drum machine for making beats, built for a tablet.

## Running it

```sh
npm install
npm run dev        # then open the printed network URL on the tablet
npm test           # vitest
npm run build      # typecheck + production build with service worker
```

To try it on a real iPad, hit the `--host` network URL Vite prints, then
**Share → Add to Home Screen**. iOS has no install prompt, so this is the only
way to get standalone mode.

## Decisions

| Choice | Why |
| --- | --- |
| Drums synthesised in Web Audio, not sampled | No audio assets, so the whole app precaches and works offline. |
| Local-only storage (IndexedDB) | No backend, no accounts, no privacy obligations. |
| Installable PWA | Fastest path to something playable, no app store. |
| Tablet-first, landscape | ~60px grid cells with one measure visible. |
| 8 sounds x 16 steps per measure | Scroll sideways; `+` at the right end appends a measure. |
| Separate library screen, not a side panel | Matches how the app is meant to be navigated. |
| React over Preact | Preact's bundle-size win is moot for a precached offline app. |

## Architecture

```
src/
  audio/
    timing.ts        pure step/time math (no Web Audio, fully unit tested)
    context.ts       AudioContext singleton, master bus, iOS unlock
    voices/          one module per drum sound
  ui/                screens and components
  test/              mock Web Audio graph for tests
```

Two rules that the rest of the app depends on:

1. **The audio engine is a module-level singleton, outside React.** Navigating
   between the sequencer and the library must never tear down the
   `AudioContext`.
2. **Visuals never drive audio.** Notes are scheduled ahead of time against
   `audioContext.currentTime`; the playhead is drawn separately from a
   `requestAnimationFrame` loop that only reads that clock.

## Roadmap

- [x] **0** Scaffold: Vite/React/TS, PWA, shell layout
- [x] **1** One kick drum and a play button, verified on the tablet
- [ ] **2** All 8 voices, lookahead scheduler, looping 16-step pattern, BPM
- [ ] **3** Grid UI: toggles, playhead, drag-to-paint, mute/volume
- [ ] **4** Multi-measure: horizontal scroll, `+`, playhead auto-follow
- [ ] **5** Save/load patterns to IndexedDB
- [ ] **6** Library screen: list, thumbnails, play in place, duplicate/delete
- [ ] **7** PWA polish: PNG icons, wake lock, install hint, worker-based tick
- [ ] **8** Extras: swing, accents, share-via-URL, alternate kits, undo

## Known platform traps

- **iOS silent switch mutes Web Audio.** Handled by setting
  `navigator.audioSession.type = 'playback'` (Safari 16.4+).
- **Safari evicts IndexedDB after 7 days of non-use** for sites that are not
  installed to the home screen. Saved patterns need the install, plus an export
  escape hatch.
- **Background tabs throttle `setTimeout` to 1/sec**, which will stall the
  scheduler. The tick moves into a Web Worker in phase 7.
- **Never put the playhead in React state.** At four measures that is 512 cells
  re-rendering eight times a second. Drive it with a CSS variable on the grid
  container instead.
