import { getEngine, unlock } from './context'
import { getVoice, type VoiceId } from './kit'
import { lead } from './voices/lead'
import { pitchFreq } from './scale'

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

/** The melodic equivalent: hear the note, at the length you just drew it. */
export async function auditionNote(pitch: number, seconds: number, level: number): Promise<void> {
  await unlock()
  const { ctx, master } = getEngine()
  lead(ctx, master, ctx.currentTime + NUDGE, {
    freq: pitchFreq(pitch),
    duration: seconds,
    level,
  })
}
