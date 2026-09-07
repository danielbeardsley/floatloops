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
| Sections fold rather than scroll | Nine drums plus fourteen pitches will not fit a tablet, and folding beats hunting. |
| Separate library screen, not a side panel | Matches how the app is meant to be navigated. |
| A song names its beats rather than copying them | One source of truth: fixing a beat fixes every song using it. |
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
    song.ts          saved song format + its edit helpers and playback maths
    arrangement.ts   what the scheduler plays: a length, and who sounds where
    migrate.ts       turns anything out of storage into a usable Pattern or Song
    storage.ts       IndexedDB CRUD; the only place that touches the database
    preferences.ts   per-device settings in localStorage, guarded reads
    patternStore.ts  zustand store for the beat being edited
    songStore.ts     zustand store for the song being arranged
    settingsStore.ts zustand store for preferences
    libraryStore.ts  zustand store for the saved beats and songs
    transport.ts     the one Sequencer, outside React
  ui/                screens and components
  test/              mock Web Audio graph for tests
```

Two rules that the rest of the app depends on:

1. **The audio engine is a module-level singleton, outside React.** Navigating
   between screens must never tear down the `AudioContext` -- that would cost
   another unlock gesture. The *transport* is a different matter: each screen
   stops what it started when it goes away, because a beat playing on from a
   screen you have left has no playhead and no stop button. Engine survives,
   playback does not.
2. **Visuals never drive audio.** Notes are scheduled ahead of time against
   `audioContext.currentTime`; the playhead is drawn separately from a
   `requestAnimationFrame` loop that only reads that clock.
3. **The scheduler plays an `Arrangement`, not a `Pattern`.** A beat and a
   whole song are the same thing to it: a length in steps, and for any step
   the list of patterns sounding there. That indirection is the only reason
   songs did not need a second scheduler.

## Saved beats

Patterns go to IndexedDB on the device, and **every read passes through
`migratePattern`**. Nothing outside `storage.ts` ever sees a raw stored object.

That layer rebuilds the track list from the current kit rather than trusting
what was saved, which is what lets the kit gain, lose or reorder a drum without
corrupting existing beats. A pattern written by a newer build is refused rather
than mangled.

Saving is still an explicit button press, so a reload loses unsaved work. See
the roadmap.

## Songs

A song is rows over bars: each **row** is one beat from the library, each
**column** is one bar, and a **clip** is a run of bars in which that beat plays.
Rows layer, so a drum beat and a melodic one can run at once.

A row stores a beat's **id**, not a copy of it. Editing a beat updates every
song that uses it, and a song stays a few hundred bytes. The price is that a
row can outlive the beat it names, which is handled rather than prevented: the
row draws as *Missing beat* and plays silence, and the rest of the song plays
on. `migrateSong` keeps the dangling id rather than dropping the row, because
the beat may simply not be loaded yet.

The beat **loops inside its clip**, so a one-bar beat dragged across four bars
plays four times and a two-bar beat plays 1,2,1,2. Every clip length is
therefore valid, which is why removing a bar *shortens* a clip it cuts through
instead of dropping it -- the opposite of what removing a measure does to a
melody note, where there is no honest new length.

Clip length and beat length are independent, so the grid has to say how the two
line up or a beat gets truncated with nothing on screen to explain it:

| | |
| --- | --- |
| A press places the beat **whole** | Tapping a four-bar beat lays down four bars. `minDraw` on the gesture layer; resizing afterwards can still shorten it, because cutting to a fill is a real thing to want. |
| The gap stays **open at a loop point** | Bars inside one pass are bridged and divided by a hairline; where the beat starts again the full gap shows through, so the repeats read as repeats. |
| `xN` on the first cell | How many times the beat plays, not how many bars -- and only when it plays more than once. |
| A **striped** tail | The last pass is cut short, either by a deliberate resize or by the end of the song. Placement clamps to the song's length rather than growing it, so this is what makes that visible. |
| `4 bars` in the row label | How long the beat itself is, which is what decides where the seams fall. |

The **song's tempo wins** over each beat's own. Beats written at different
tempos would otherwise make the music lurch every time a new one came in.

The row's fader scales the beat's drums, but **replaces its melody level**
rather than scaling it. A beat's melody was balanced against that beat's own
drums, which is the wrong question once it is one row among several -- and two
faders in series means the row's does not mean what it says. So in a song the
row fader *is* the melody's level, which is also the only way to make a quietly
written melody louder. Muting is not a level: a melody switched off inside its
beat stays off however loud its row.

Editing a beat from a song row lands you in the sequencer, where a bar across
the top says which song you came from and offers **Save & back to song** as one
button. It is shown when the open song has a row playing the open beat --
derived rather than remembered from the trip in, so it is true however you got
there and cannot go stale when the row is removed.

Since a row names a *library* beat, forgetting the save does not lose the work
-- the sequencer keeps it -- but the song goes on playing the last version that
was saved. That is what the unsaved warning says, on the way-back button and on
the header's Song link alike. Saved-ness is decided by comparing what a save
would write, not by timestamps: an edit in the same millisecond as a save would
read as no edit, and a note dragged away and back rebuilds the note list
without changing the music.

Both transports carry an **Unsaved** mark once the editor holds more than the
library does -- on the beat side it steps aside when the way-back bar is
already saying so, and saying the more useful half of it. A beat the library
has never heard of counts, which is what makes the working beat's unsavedness
visible at all.

The song itself is marked **Unsaved** in its transport once it differs from
the library's copy, and leaving for the library asks first. A song is not
merely out of date while it is unsaved, the way a beat is -- the library is
where an arrangement gets *replaced*, by opening another song or starting a
new one, so those two acts ask as well. That second guard is the one that has
to hold: the boundary warning can be walked past, or missed entirely by
reaching the library from the beat screen. Going from the song to the beat
screen is deliberately not guarded, since nothing is lost by it and fixing a
beat mid-arrangement is the ordinary workflow.

The grid reuses the piano roll's gesture layer whole: a clip is drawn, resized
from either end, slid along and tapped away exactly like a note. The one
difference is `lockLane` -- a clip cannot change rows, because a row *is* which
beat plays, so dragging one upward would silently swap the beat rather than
move the block.

## The two halves

Drums and melody are each a section of one grid, and each folds away behind the
same header. Collapsing is only ever visual -- both go on playing -- so a
folded header says how much is hidden rather than leaving a silent gap: how
many drums are in use, how many notes there are. The drums open by default and
the melody does not, since the melody is what you fold *out*, and both choices
are remembered per device.

## The melody

Below the drums, a collapsible piano roll: fourteen pitches of A minor
pentatonic, C3 up to G5, so no combination of notes can clash. Notes have a start and a length, snapped
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

Scrolling has two ways in, because the cells cannot be one of them:

| | |
| --- | --- |
| **The chrome** | The ruler pans sideways and the row-label column pans up and down. Both are sticky, so neither can scroll out of reach, and the dotted seam down the label column is what says so. |
| **Two fingers** | Pans both ways from anywhere, cells included. It engages only when the first finger came down on a cell; everywhere else the browser is already panning, and a second panner on top would move the grid twice as fast. |

`touch-action` on the grid is `pan-x pan-y`, and that value is a *ceiling on
every descendant*: while it read `pan-x`, nothing inside could scroll
vertically however it was marked, which made a grid taller than the screen
unreachable below the fold. The cells still opt out with `none`, so a
one-finger drag paints.

Two fingers abandon whatever one finger had begun -- the stroke is put back
cell by cell, and a half-drawn note is dropped rather than committed. Reaching
for a scroll should not leave a mark. Each gesture layer also takes one
pointer at a time now; a second finger used to start its own stroke, taking the
mode and the undo record with it.

In the piano roll, what a press means depends on the cell it lands on:

| Where the press lands | Gesture |
| --- | --- |
| empty | drag right to draw a note of that length |
| a handle, at either end of a note | resize from that end; the other end stays put |
| anywhere else on a note | move it -- length fixed, and the row under the finger sets the pitch |
| a note, tapped without dragging | delete |

Resizing lives entirely in two **handles**, drawn at the outer ends of a note's
run. That is what makes short notes draggable: a one-step note is its own start
and its own end, and a two-step note is both with nothing in between, so under
the older rule of "the middle moves" neither had a middle to grab and neither
could be moved at all. A handle only counts on the end it belongs to -- the
left handle of a note's last cell is not a thing, so a press there moves.

The handles are real elements rather than a measured strip of the cell, so what
can be grabbed is exactly what is drawn and the two cannot drift apart. Song
clips use the same ones.

Drawing a new note stays on the row it started on, because a stray row during a
draw is easy to do by accident. Moving deliberately does not, because changing
the row is how a wrong note gets fixed.

Placing a drum step or a note plays it, so you learn which row is which -- but
never while the sequencer is running, where it is about to sound in its own place
and doubling it only muddles the beat. A note auditions for a single step
whatever its real length, since the point is to hear the pitch, not to sit
through a held note.

Edits preview and commit on release rather than applying as the finger moves --
dragging across a neighbouring note would otherwise consume it on the way past,
with no way back. Committing replaces any note it overlaps.

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
- [x] **7** Songs: arrange saved beats over bars, one row per beat
- [ ] **8** PWA polish: PNG icons, wake lock, install hint, worker-based tick
- [ ] **9** Extras: swing, accents, share-via-URL, alternate kits, undo,
      autosave the working beat so a reload cannot lose it

## Known platform traps

- **iOS silent switch mutes Web Audio.** Handled by setting
  `navigator.audioSession.type = 'playback'` (Safari 16.4+).
- **A blocked IndexedDB upgrade waits forever, silently.** A version bump
  cannot run while another tab still holds the old version, and the open
  request simply never settles -- the library screen spins with nothing to
  say. `storage.ts` handles both sides: a connection that is *blocking* an
  upgrade closes itself, and one that is *blocked* gives up with a message
  naming the cause. Hot reload triggers this too, since the previous module
  instance's connection outlives it.
- **Safari evicts IndexedDB after 7 days of non-use** for sites that are not
  installed to the home screen. Saved patterns need the install, plus an export
  escape hatch.
- **Background tabs throttle `setTimeout` to 1/sec**, which will stall the
  scheduler. The tick moves into a Web Worker in phase 7.
- **Never put the playhead in React state.** At four measures that is 512 cells
  re-rendering eight times a second. `usePlayhead` swaps a class on just the
  cells that changed, from an animation frame loop.
- **jsdom has no `PointerEvent`.** Testing Library falls back to a plain
  `Event`, which silently drops `pointerId` and the coordinates -- so a test
  can fire two fingers and the code under test sees one. `src/test/setup.ts`
  supplies a minimal stand-in.
- **Pointer capture retargets events.** The paint handlers must live on the same
  element that calls `setPointerCapture`, or the drag stops firing the moment it
  starts. jsdom has no pointer capture, so tests will not catch this.
