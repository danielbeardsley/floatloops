import { getEngine, unlock } from '../audio/context'
import { Sequencer } from '../audio/scheduler'
import { patternArrangement, type Arrangement } from './arrangement'
import { placeArrangement, placeOf, type Place } from './alignment'
import { useLibraryStore } from './libraryStore'
import { usePatternStore } from './patternStore'
import { useSettingsStore } from './settingsStore'
import { useSongStore } from './songStore'
import { songArrangement, type Song } from './song'
import type { Pattern } from './schema'

/**
 * The one Sequencer, created lazily and kept outside React alongside the audio
 * engine, so that navigating never has to rebuild either of them. Playback
 * itself does not survive a screen change -- see useStopOnLeave.
 */
let sequencer: Sequencer | null = null

/**
 * What is on the transport right now, read fresh on every tick.
 *
 * One timeline plays at a time, and which one is decided by the `isPlaying`
 * flags the play buttons set -- the song store's is checked first because
 * starting a song is what stops a beat. Nothing here is consulted while the
 * sequencer is stopped.
 */
/**
 * Where the beat on screen is being edited, when it is being edited at a place
 * and the switch is on.
 *
 * The trip in is what decides it, not merely that the song plays the beat: the
 * song store holds whatever was last arranged, so a beat opened from the
 * library is often in one by coincidence, and hearing a song nobody opened
 * come up underneath it would be a shock.
 */
function placeBeingEdited(): { song: Song; place: Place } | null {
  if (!useSettingsStore.getState().showOthers) return null

  const beat = usePatternStore.getState()
  const song = useSongStore.getState().song
  if (beat.fromSong !== song.id) return null

  const place = placeOf(song, beat.pattern.id, beat.pattern.measures, beat.atBar)
  return place ? { song, place } : null
}

function currentArrangement(): Arrangement {
  const song = useSongStore.getState()
  if (song.isPlaying) {
    return songArrangement(song.preview ?? song.song, useLibraryStore.getState().patternsById)
  }

  const beat = usePatternStore.getState()
  if (beat.preview) return patternArrangement(beat.preview)

  // A beat being edited at a place in a song plays with the rest of it, since
  // the same switch put the rest of it on the screen. Read fresh here like
  // everything else, so the switch takes effect at the next lookahead rather
  // than needing the transport restarted.
  const here = placeBeingEdited()
  if (here) {
    return placeArrangement(
      beat.pattern,
      here.song,
      useLibraryStore.getState().patternsById,
      here.place,
    )
  }

  return patternArrangement(beat.pattern)
}

export function getSequencer(): Sequencer {
  if (!sequencer) {
    sequencer = new Sequencer({ engine: getEngine(), getArrangement: currentArrangement })
  }
  return sequencer
}

/**
 * Clears every play flag and stops the clock. Both stores are always written,
 * so the two screens' buttons can never both claim to be running.
 */
export function stop(): void {
  sequencer?.stop()

  const beat = usePatternStore.getState()
  beat.setPlaying(false)
  beat.setPreview(null)

  const song = useSongStore.getState()
  song.setPlaying(false)
  song.setPreview(null)
}

/**
 * Must be called from a user gesture: the first play is what unlocks audio.
 * The flags are set before the sequencer starts, because `start` reads the
 * arrangement to find its tempo.
 */
async function begin(mark: () => void): Promise<void> {
  stop()
  mark()
  await unlock()
  getSequencer().start()
}

export async function play(): Promise<void> {
  await begin(() => usePatternStore.getState().setPlaying(true))
}

export async function playSong(): Promise<void> {
  await begin(() => useSongStore.getState().setPlaying(true))
}

/**
 * Plays a saved beat from the library without opening it. Restarting the
 * sequencer is what makes the preview begin at its own downbeat.
 */
export async function playPreview(pattern: Pattern): Promise<void> {
  await begin(() => {
    const store = usePatternStore.getState()
    store.setPreview(pattern)
    store.setPlaying(true)
  })
}

export async function playSongPreview(song: Song): Promise<void> {
  await begin(() => {
    const store = useSongStore.getState()
    store.setPreview(song)
    store.setPlaying(true)
  })
}

export async function togglePlay(): Promise<void> {
  if (usePatternStore.getState().isPlaying) stop()
  else await play()
}

export async function toggleSongPlay(): Promise<void> {
  if (useSongStore.getState().isPlaying) stop()
  else await playSong()
}

/** Test seam. */
export function resetTransport(): void {
  sequencer?.stop()
  sequencer = null
}
