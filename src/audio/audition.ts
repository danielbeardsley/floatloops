import { getEngine, unlock } from './context'
import { getVoice, type VoiceId } from './kit'
import { getMelodyVoice, type MelodyVoiceId } from './melodyKit'
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

/**
 * The melodic equivalent: hear the note, at the length you just drew it, with
 * the sound the beat is set to -- auditioning with anything else would teach a
 * kid the wrong thing about what they just drew.
 */
export async function auditionNote(
  voiceId: MelodyVoiceId,
  pitch: number,
  seconds: number,
  level: number,
): Promise<void> {
  await unlock()
  const { ctx, master } = getEngine()
  getMelodyVoice(voiceId).trigger(ctx, master, ctx.currentTime + NUDGE, {
    freq: pitchFreq(pitch),
    duration: seconds,
    level,
  })
}
