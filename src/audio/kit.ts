import { bass } from './voices/bass'
import { clap } from './voices/clap'
import { cowbell } from './voices/cowbell'
import { closedHat, openHat } from './voices/hat'
import { kick } from './voices/kick'
import { snare } from './voices/snare'
import { stab } from './voices/stab'
import { sweep } from './voices/sweep'
import { highTom, lowTom } from './voices/tom'
import { zap } from './voices/zap'

export type VoiceId =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'closedHat'
  | 'openHat'
  | 'lowTom'
  | 'highTom'
  | 'cowbell'
  | 'bass'
  | 'stab'
  | 'zap'
  | 'sweep'

export type TriggerOptions = { level?: number }

export type Trigger = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  opts?: TriggerOptions,
) => void

export type VoiceDef = {
  id: VoiceId
  /** Shown in the grid's track column. Kept short so it fits. */
  name: string
  /** Colour of this track's lit cells. */
  color: string
  defaultLevel: number
  trigger: Trigger
}

/**
 * Row order, top to bottom. Kick first: it is the one kids reach for. Drums
 * come first as a block, then the synth voices, so the grid reads as two
 * halves rather than a jumble.
 */
export const KIT: readonly VoiceDef[] = [
  { id: 'kick', name: 'Kick', color: '#ff5c7a', defaultLevel: 0.9, trigger: kick },
  { id: 'snare', name: 'Snare', color: '#ffd166', defaultLevel: 0.7, trigger: snare },
  { id: 'clap', name: 'Clap', color: '#ff9f68', defaultLevel: 0.6, trigger: clap },
  { id: 'closedHat', name: 'Hat', color: '#4ecdc4', defaultLevel: 0.4, trigger: closedHat },
  { id: 'openHat', name: 'Open Hat', color: '#5aa9e6', defaultLevel: 0.35, trigger: openHat },
  { id: 'lowTom', name: 'Low Tom', color: '#a785e2', defaultLevel: 0.6, trigger: lowTom },
  { id: 'highTom', name: 'High Tom', color: '#c98bdb', defaultLevel: 0.6, trigger: highTom },
  { id: 'cowbell', name: 'Cowbell', color: '#9fd356', defaultLevel: 0.45, trigger: cowbell },
  { id: 'bass', name: 'Bass', color: '#6d7ff5', defaultLevel: 0.7, trigger: bass },
  { id: 'stab', name: 'Stab', color: '#f062c8', defaultLevel: 0.45, trigger: stab },
  { id: 'zap', name: 'Zap', color: '#3ddc84', defaultLevel: 0.4, trigger: zap },
  { id: 'sweep', name: 'Sweep', color: '#c9cfe0', defaultLevel: 0.35, trigger: sweep },
] as const

export const VOICE_IDS: readonly VoiceId[] = KIT.map((voice) => voice.id)

const BY_ID = new Map(KIT.map((voice) => [voice.id, voice]))

export function getVoice(id: VoiceId): VoiceDef {
  const voice = BY_ID.get(id)
  if (!voice) throw new Error(`Unknown voice: ${id}`)
  return voice
}
