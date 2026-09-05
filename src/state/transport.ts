import { getEngine, unlock } from '../audio/context'
import { Sequencer } from '../audio/scheduler'
import { usePatternStore } from './patternStore'

/**
 * The one Sequencer, created lazily and kept outside React alongside the audio
 * engine, so navigating between screens cannot interrupt playback.
 */
let sequencer: Sequencer | null = null

export function getSequencer(): Sequencer {
  if (!sequencer) {
    sequencer = new Sequencer({
      engine: getEngine(),
      getPattern: () => usePatternStore.getState().pattern,
    })
  }
  return sequencer
}

/** Must be called from a user gesture: the first play is what unlocks audio. */
export async function play(): Promise<void> {
  await unlock()
  getSequencer().start()
  usePatternStore.getState().setPlaying(true)
}

export function stop(): void {
  sequencer?.stop()
  usePatternStore.getState().setPlaying(false)
}

export async function togglePlay(): Promise<void> {
  if (usePatternStore.getState().isPlaying) stop()
  else await play()
}

/** Test seam. */
export function resetTransport(): void {
  sequencer?.stop()
  sequencer = null
}
