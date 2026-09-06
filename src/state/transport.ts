import { getEngine, unlock } from '../audio/context'
import { Sequencer } from '../audio/scheduler'
import { patternArrangement, type Arrangement } from './arrangement'
import { useLibraryStore } from './libraryStore'
import { usePatternStore } from './patternStore'
import { useSongStore } from './songStore'
import { songArrangement, type Song } from './song'
import type { Pattern } from './schema'

/**
 * The one Sequencer, created lazily and kept outside React alongside the audio
 * engine, so navigating between screens cannot interrupt playback.
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
function currentArrangement(): Arrangement {
  const song = useSongStore.getState()
  if (song.isPlaying) {
    return songArrangement(song.preview ?? song.song, useLibraryStore.getState().patternsById)
  }

  const beat = usePatternStore.getState()
  return patternArrangement(beat.preview ?? beat.pattern)
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
