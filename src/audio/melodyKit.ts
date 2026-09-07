import { bells } from './voices/bells'
import { chorus } from './voices/chorus'
import { flute } from './voices/flute'
import { lead } from './voices/lead'
import { pluck } from './voices/pluck'

/**
 * The sounds the melody can be played with, as the drums have a kit.
 *
 * Every one of these is told a pitch *and* a length, which is what separates
 * them from the drum kit: a drum decides its own length, while a melody voice
 * has to hold a note for as long as the roll says. How each interprets that
 * length is its own business -- the lead, the flute and the chorus sustain,
 * the bells and the pluck ring on and die away.
 */

export type MelodyVoiceId = 'lead' | 'bells' | 'flute' | 'pluck' | 'chorus'

export type MelodyNoteOptions = {
  freq?: number
  duration?: number
  level?: number
}

export type MelodyTrigger = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts?: MelodyNoteOptions,
) => void

export type MelodyVoiceDef = {
  id: MelodyVoiceId
  /** Shown in the melody header's picker. Kept short so it fits. */
  name: string
  trigger: MelodyTrigger
}

/**
 * Picker order. The lead comes first because it is what every beat written
 * before there was a choice is still played with.
 */
export const MELODY_KIT: readonly MelodyVoiceDef[] = [
  { id: 'lead', name: 'Lead', trigger: lead },
  { id: 'bells', name: 'Bells', trigger: bells },
  { id: 'flute', name: 'Flute', trigger: flute },
  { id: 'pluck', name: 'Pluck', trigger: pluck },
  { id: 'chorus', name: 'Chorus', trigger: chorus },
] as const

export const MELODY_VOICE_IDS: readonly MelodyVoiceId[] = MELODY_KIT.map((voice) => voice.id)

export const DEFAULT_MELODY_VOICE: MelodyVoiceId = 'lead'

const BY_ID = new Map(MELODY_KIT.map((voice) => [voice.id, voice]))

export function isMelodyVoiceId(value: unknown): value is MelodyVoiceId {
  return typeof value === 'string' && BY_ID.has(value as MelodyVoiceId)
}

/**
 * Unlike the drum kit's lookup, this one falls back rather than throwing: the
 * id comes out of a saved beat, and a melody played with the wrong sound beats
 * a beat that will not open at all.
 */
export function getMelodyVoice(id: MelodyVoiceId): MelodyVoiceDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_MELODY_VOICE)!
}
