import { VOICE_IDS, getVoice, type VoiceId } from '../audio/kit'
import { STEPS_PER_MEASURE, clampBpm, stepCount } from '../audio/timing'
import { isPitch } from '../audio/scale'
import { DEFAULT_MELODY_VOICE, isMelodyVoiceId, type MelodyVoiceId } from '../audio/melodyKit'

/**
 * The saved-pattern format. Every change here needs a bump to PATTERN_VERSION
 * and a migration, because these objects outlive the code that wrote them.
 */
export const PATTERN_VERSION = 5

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

/**
 * A melodic note. Unlike a drum step, it has a length -- which is the entire
 * reason the melody is a list of notes rather than another grid of cells.
 */
export type Note = {
  id: string
  /** Index into the scale, 0 being the lowest pitch. */
  pitch: number
  /** Step the note begins on. */
  start: number
  /** How many steps it is held for, at least one. */
  length: number
  velocity: number
}

export type Melody = {
  level: number
  muted: boolean
  /** Which sound the notes are played with. Saved with the beat. */
  voiceId: MelodyVoiceId
  notes: Note[]
}

export const MELODY_DEFAULTS: Omit<Melody, 'notes'> = {
  level: 0.6,
  muted: false,
  voiceId: DEFAULT_MELODY_VOICE,
}

export type Pattern = {
  id: string
  name: string
  bpm: number
  measures: number
  tracks: Track[]
  /**
   * Silences every drum at once, on top of whatever the individual tracks say.
   * Kept separate from their own `muted` flags so unmuting the section gives
   * back exactly the mix that was there before, rather than nine unmuted
   * tracks.
   */
  drumsMuted: boolean
  melody: Melody
  version: number
  createdAt: number
  updatedAt: number
}

export const DEFAULT_BPM = 110
export const FULL_VELOCITY = 1

/**
 * Not a musical limit -- a beat is as long as it needs to be, and nothing
 * here cares how many bars that is. This is the point past which a
 * `measures` read back off disk is taken to be corrupt rather than made,
 * since every track is allocated a step per sixteenth of it and a nonsense
 * number would allocate until the tab died.
 *
 * It applies to the editor as well as to loading, so that a beat that can be
 * built is always a beat that can be saved and opened again. Well beyond
 * anything anyone will reach by tapping a button once per bar.
 */
export const MEASURE_LIMIT = 1024

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
    drumsMuted: false,
    melody: { ...MELODY_DEFAULTS, notes: [] },
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

const totalStepsOf = totalSteps

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

export function toggleDrumsMute(pattern: Pattern): Pattern {
  return revise(pattern, { drumsMuted: !pattern.drumsMuted })
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
  if (!Number.isFinite(measures)) return pattern
  const next = Math.min(MEASURE_LIMIT, Math.max(1, Math.floor(measures)))
  if (next === pattern.measures) return pattern

  const length = next * STEPS_PER_MEASURE
  const tracks = pattern.tracks.map((track) => {
    const steps = track.steps.slice(0, length)
    while (steps.length < length) steps.push(0)
    return { ...track, steps }
  })

  return revise(pattern, {
    measures: next,
    tracks,
    melody: { ...pattern.melody, notes: fitNotes(pattern.melody.notes, length) },
  })
}

export function addMeasure(pattern: Pattern): Pattern {
  return setMeasures(pattern, pattern.measures + 1)
}

export function canAddMeasure(pattern: Pattern): boolean {
  return pattern.measures < MEASURE_LIMIT
}

/**
 * Cuts one measure out of the middle, closing the gap behind it. Distinct from
 * setMeasures, which can only trim from the end -- dropping a bar you do not
 * like should not cost you every bar after it.
 */
export function removeMeasure(pattern: Pattern, measureIndex: number): Pattern {
  if (!canRemoveMeasure(pattern)) return pattern
  if (measureIndex < 0 || measureIndex >= pattern.measures) return pattern

  const start = measureIndex * STEPS_PER_MEASURE
  const end = start + STEPS_PER_MEASURE

  const tracks = pattern.tracks.map((track) => ({
    ...track,
    steps: [...track.steps.slice(0, start), ...track.steps.slice(end)],
  }))

  // A note straddling the cut has no sensible new length, so it goes with the
  // measure. Notes after the cut slide back to close the gap.
  const notes = pattern.melody.notes
    .filter((note) => note.start + note.length <= start || note.start >= end)
    .map((note) =>
      note.start >= end ? { ...note, start: note.start - STEPS_PER_MEASURE } : note,
    )

  return revise(pattern, {
    measures: pattern.measures - 1,
    tracks,
    melody: { ...pattern.melody, notes },
  })
}

export function canRemoveMeasure(pattern: Pattern): boolean {
  return pattern.measures > 1
}

/** Whether a measure holds anything, so an empty one can be dropped silently. */
export function measureHasHits(pattern: Pattern, measureIndex: number): boolean {
  const start = measureIndex * STEPS_PER_MEASURE
  const end = start + STEPS_PER_MEASURE

  const drums = pattern.tracks.some((track) =>
    track.steps.slice(start, end).some((step) => step > 0),
  )
  const melody = pattern.melody.notes.some(
    (note) => note.start < end && note.start + note.length > start,
  )

  return drums || melody
}

/* --- melody -------------------------------------------------------------- */

export function noteCovers(note: Note, step: number): boolean {
  return step >= note.start && step < note.start + note.length
}

export function noteAt(melody: Melody, pitch: number, step: number): Note | undefined {
  return melody.notes.find((note) => note.pitch === pitch && noteCovers(note, step))
}

/** Which part of a held note a given step is, so the cell can be drawn right. */
export function noteRole(note: Note, step: number): 'single' | 'start' | 'middle' | 'end' {
  const last = note.start + note.length - 1
  if (note.start === last) return 'single'
  if (step === note.start) return 'start'
  if (step === last) return 'end'
  return 'middle'
}

export type NoteDraft = {
  pitch: number
  start: number
  length: number
  velocity?: number
}

/**
 * Adds a note, dropping anything it overlaps at the same pitch. Last write
 * wins: drawing across an existing note replaces it rather than producing two
 * notes fighting over the same steps.
 */
export function addNote(pattern: Pattern, draft: NoteDraft): Pattern {
  if (!isPitch(draft.pitch)) return pattern

  const length = totalStepsOf(pattern)
  const start = Math.max(0, Math.min(length - 1, Math.floor(draft.start)))
  const span = Math.max(1, Math.min(length - start, Math.floor(draft.length)))
  const end = start + span

  const kept = pattern.melody.notes.filter(
    (note) =>
      note.pitch !== draft.pitch || note.start + note.length <= start || note.start >= end,
  )

  const note: Note = {
    id: createId(),
    pitch: draft.pitch,
    start,
    length: span,
    velocity: Math.min(1, Math.max(0, draft.velocity ?? FULL_VELOCITY)),
  }

  return revise(pattern, { melody: { ...pattern.melody, notes: [...kept, note] } })
}

/**
 * Moves or resizes an existing note, keeping its identity and velocity. Overlap
 * rules apply against the *other* notes -- a note never collides with itself.
 */
export function updateNote(pattern: Pattern, id: string, draft: NoteDraft): Pattern {
  const existing = pattern.melody.notes.find((note) => note.id === id)
  if (!existing || !isPitch(draft.pitch)) return pattern

  const length = totalStepsOf(pattern)
  const start = Math.max(0, Math.min(length - 1, Math.floor(draft.start)))
  const span = Math.max(1, Math.min(length - start, Math.floor(draft.length)))
  const end = start + span

  const kept = pattern.melody.notes.filter(
    (note) =>
      note.id !== id &&
      (note.pitch !== draft.pitch || note.start + note.length <= start || note.start >= end),
  )

  const updated: Note = { ...existing, pitch: draft.pitch, start, length: span }
  return revise(pattern, { melody: { ...pattern.melody, notes: [...kept, updated] } })
}

export function removeNote(pattern: Pattern, id: string): Pattern {
  const notes = pattern.melody.notes.filter((note) => note.id !== id)
  if (notes.length === pattern.melody.notes.length) return pattern
  return revise(pattern, { melody: { ...pattern.melody, notes } })
}

export function setMelodyLevel(pattern: Pattern, level: number): Pattern {
  const melody = { ...pattern.melody, level: Math.min(1, Math.max(0, level)) }
  return revise(pattern, { melody })
}

/** An id this build does not have is ignored, rather than silencing the beat. */
export function setMelodyVoice(pattern: Pattern, voiceId: MelodyVoiceId): Pattern {
  if (!isMelodyVoiceId(voiceId)) return pattern
  return revise(pattern, { melody: { ...pattern.melody, voiceId } })
}

export function toggleMelodyMute(pattern: Pattern): Pattern {
  return revise(pattern, { melody: { ...pattern.melody, muted: !pattern.melody.muted } })
}

/** Trims notes to fit a pattern of `length` steps, dropping any left stranded. */
function fitNotes(notes: Note[], length: number): Note[] {
  return notes
    .filter((note) => note.start < length)
    .map((note) => ({ ...note, length: Math.min(note.length, length - note.start) }))
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
