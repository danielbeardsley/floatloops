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
| 9 sounds x 16 steps per measure | Seven drums then two synth voices; scroll sideways, `+` appends a measure. |
| Separate library screen, not a side panel | Matches how the app is meant to be navigated. |
| React over Preact | Preact's bundle-size win is moot for a precached offline app. |

## Architecture

```
src/
  audio/
    timing.ts        pure step/time math (no Web Audio, fully unit tested)
    context.ts       AudioContext singleton, master bus, iOS unlock
    scheduler.ts     lookahead clock; the only thing that triggers voices
    kit.ts           the nine sounds: order, colours, default levels
    voices/          one module per drum sound
  state/
    schema.ts        saved pattern format + pure, immutable edit helpers
    migrate.ts       turns anything out of storage into a usable Pattern
    storage.ts       IndexedDB CRUD; the only place that touches the database
    preferences.ts   per-device settings in localStorage, guarded reads
    patternStore.ts  zustand store for the beat being edited
    settingsStore.ts zustand store for preferences
    libraryStore.ts  zustand store for the saved list
    transport.ts     the one Sequencer, outside React
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

## Saved beats

Patterns go to IndexedDB on the device, and **every read passes through
`migratePattern`**. Nothing outside `storage.ts` ever sees a raw stored object.

That layer rebuilds the track list from the current kit rather than trusting
what was saved, which is what lets the kit gain, lose or reorder a drum without
corrupting existing beats. A pattern written by a newer build is refused rather
than mangled.

Saving is still an explicit button press, so a reload loses unsaved work. See
the roadmap.

## The melody

Below the drums, a collapsible piano roll: eight pitches of A minor pentatonic,
so no combination of notes can clash. Notes have a start and a length, snapped
to the grid, which is why the melody is a list of `Note` objects rather than
another grid of cells.

Its mute and volume sit in the section header and stay visible when the roll is
collapsed -- the melody still plays either way, so its level has to stay
reachable, exactly like a drum track's.

It shares the drums' scroll container rather than having one of its own. That is
what keeps the columns aligned and lets the ruler, the add-measure button and the
playhead apply to both halves without any syncing code.

`lead` is the only voice that is *played* rather than struck: every drum decides
its own length, while the lead is told how long to hold, so it has a real sustain
and release. Any future pitched voice needs that same shape.

## Gestures

Cells are `touch-action: none` so a drag paints reliably in any direction, which
means they cannot also pan the grid. The **measure ruler** above the grid is what
scrolls it -- drag it, or tap a measure number to jump there. Each measure also
carries a `×` that removes it, which closes the gap rather than truncating from
the end, so dropping bar 2 of 4 leaves bars 1, 3 and 4 intact. It only asks for
confirmation when the measure has something in it.

In the piano roll, press an empty cell and drag right to draw a note of that
length; press a note to delete it. The pitch is fixed by the cell the drag starts
on. Drawing replaces any note it overlaps, rather than stacking on top of it.

The playhead scrolls the grid on its own while playing, a measure at a time,
except while a finger is down. The **Follow** toggle in the grid's top-left
corner turns that off; the choice is remembered per device in localStorage.

## Roadmap

- [x] **0** Scaffold: Vite/React/TS, PWA, shell layout
- [x] **1** One kick drum and a play button, verified on the tablet
- [x] **2** All 8 voices, lookahead scheduler, looping pattern, BPM
- [x] **3** Grid UI: toggles, playhead, drag-to-paint, mute/volume
- [x] **4** Multi-measure: horizontal scroll, `+`, playhead auto-follow
- [x] **5** Save/load patterns to IndexedDB
- [x] **6** Library screen: list, thumbnails, play in place, duplicate/delete
- [ ] **7** PWA polish: PNG icons, wake lock, install hint, worker-based tick
- [ ] **8** Extras: swing, accents, share-via-URL, alternate kits, undo,
      autosave the working beat so a reload cannot lose it

## Known platform traps

- **iOS silent switch mutes Web Audio.** Handled by setting
  `navigator.audioSession.type = 'playback'` (Safari 16.4+).
- **Safari evicts IndexedDB after 7 days of non-use** for sites that are not
  installed to the home screen. Saved patterns need the install, plus an export
  escape hatch.
- **Background tabs throttle `setTimeout` to 1/sec**, which will stall the
  scheduler. The tick moves into a Web Worker in phase 7.
- **Never put the playhead in React state.** At four measures that is 512 cells
  re-rendering eight times a second. `usePlayhead` swaps a class on just the
  cells that changed, from an animation frame loop.
- **Pointer capture retargets events.** The paint handlers must live on the same
  element that calls `setPointerCapture`, or the drag stops firing the moment it
  starts. jsdom has no pointer capture, so tests will not catch this.
