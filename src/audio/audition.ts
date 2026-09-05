import { getEngine, unlock } from './context'
import { getVoice, type VoiceId } from './kit'

/** Scheduling exactly at currentTime can land in the past and be dropped. */
const NUDGE = 0.02

/**
 * Plays a single hit right now, so tapping a step lets you hear what you just
 * drew. This is how a kid learns which row is which.
 */
export async function audition(voiceId: VoiceId, level: number): Promise<void> {
  await unlock()
  const { ctx, master } = getEngine()
  getVoice(voiceId).trigger(ctx, master, ctx.currentTime + NUDGE, { level })
}
