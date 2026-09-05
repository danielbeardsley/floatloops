import { VOICE_IDS, getVoice, type VoiceId } from '../audio/kit'
import { STEPS_PER_MEASURE, clampBpm, stepCount } from '../audio/timing'

/**
 * The saved-pattern format. Every change here needs a bump to PATTERN_VERSION
 * and a migration, because these objects outlive the code that wrote them.
 */
export const PATTERN_VERSION = 1

/**
 * 0 means the step is off. Anything above is the hit's velocity, so accents
 * can arrive later without a change to the save format.
 */
export type Step = number

export type Track = {
  voiceId: VoiceId
  /** Track volume, 0..1. */
  level: number
  muted: boolean
  steps: Step[]
}

export type Pattern = {
  id: string
  name: string
  bpm: number
  measures: number
  tracks: Track[]
  version: number
  createdAt: number
  updatedAt: number
}

export const DEFAULT_BPM = 110
export const MAX_MEASURES = 8
export const FULL_VELOCITY = 1

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function emptySteps(measures: number): Step[] {
  return new Array<Step>(stepCount(measures)).fill(0)
}

export function createEmptyPattern(name = 'New Beat', measures = 1): Pattern {
  const now = Date.now()
  return {
    id: createId(),
    name,
    bpm: DEFAULT_BPM,
    measures,
    tracks: VOICE_IDS.map((voiceId) => ({
      voiceId,
      level: getVoice(voiceId).defaultLevel,
      muted: false,
      steps: emptySteps(measures),
    })),
    version: PATTERN_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

/** Every mutation goes through here, so updatedAt can never be forgotten. */
function revise(pattern: Pattern, changes: Partial<Pattern>): Pattern {
  return { ...pattern, ...changes, updatedAt: Date.now() }
}

function mapTrack(pattern: Pattern, index: number, fn: (track: Track) => Track): Pattern {
  if (index < 0 || index >= pattern.tracks.length) return pattern
  const tracks = pattern.tracks.map((track, i) => (i === index ? fn(track) : track))
  return revise(pattern, { tracks })
}

export function totalSteps(pattern: Pattern): number {
  return stepCount(pattern.measures)
}

export function isStepOn(track: Track, stepIndex: number): boolean {
  return (track.steps[stepIndex] ?? 0) > 0
}

export function setStep(
  pattern: Pattern,
  trackIndex: number,
  stepIndex: number,
  value: Step,
): Pattern {
  if (stepIndex < 0 || stepIndex >= totalSteps(pattern)) return pattern
  return mapTrack(pattern, trackIndex, (track) => {
    const steps = track.steps.slice()
    steps[stepIndex] = Math.min(1, Math.max(0, value))
    return { ...track, steps }
  })
}

export function toggleStep(pattern: Pattern, trackIndex: number, stepIndex: number): Pattern {
  const track = pattern.tracks[trackIndex]
  if (!track) return pattern
  return setStep(pattern, trackIndex, stepIndex, isStepOn(track, stepIndex) ? 0 : FULL_VELOCITY)
}

export function setTrackLevel(pattern: Pattern, trackIndex: number, level: number): Pattern {
  return mapTrack(pattern, trackIndex, (track) => ({
    ...track,
    level: Math.min(1, Math.max(0, level)),
  }))
}

export function toggleMute(pattern: Pattern, trackIndex: number): Pattern {
  return mapTrack(pattern, trackIndex, (track) => ({ ...track, muted: !track.muted }))
}

export function setPatternBpm(pattern: Pattern, bpm: number): Pattern {
  return revise(pattern, { bpm: clampBpm(bpm) })
}

export function renamePattern(pattern: Pattern, name: string): Pattern {
  return revise(pattern, { name })
}

/**
 * Growing pads every track with silence; shrinking truncates. Shrinking is
 * destructive, so callers are expected to confirm first.
 */
export function setMeasures(pattern: Pattern, measures: number): Pattern {
  const next = Math.min(MAX_MEASURES, Math.max(1, Math.floor(measures)))
  if (next === pattern.measures) return pattern

  const length = next * STEPS_PER_MEASURE
  const tracks = pattern.tracks.map((track) => {
    const steps = track.steps.slice(0, length)
    while (steps.length < length) steps.push(0)
    return { ...track, steps }
  })

  return revise(pattern, { measures: next, tracks })
}

export function addMeasure(pattern: Pattern): Pattern {
  return setMeasures(pattern, pattern.measures + 1)
}

export function canAddMeasure(pattern: Pattern): boolean {
  return pattern.measures < MAX_MEASURES
}

/** A recognisable beat, so a fresh app is never silent when you press play. */
export function demoPattern(): Pattern {
  const pattern = createEmptyPattern('First Beat')
  const hits: Partial<Record<VoiceId, number[]>> = {
    kick: [0, 6, 8, 14],
    snare: [4, 12],
    closedHat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [7],
  }

  return pattern.tracks.reduce((acc, track, trackIndex) => {
    const steps = hits[track.voiceId]
    if (!steps) return acc
    return steps.reduce((p, stepIndex) => setStep(p, trackIndex, stepIndex, FULL_VELOCITY), acc)
  }, pattern)
}
