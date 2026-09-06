import { VOICE_IDS, getVoice } from '../audio/kit'
import {
  MAX_MEASURES,
  MELODY_DEFAULTS,
  PATTERN_VERSION,
  createId,
  type Melody,
  type Note,
  type Pattern,
  type Track,
} from './schema'
import {
  DEFAULT_SONG_BARS,
  DEFAULT_SONG_BPM,
  MAX_SONG_BARS,
  MAX_SONG_ROWS,
  ROW_DEFAULTS,
  SONG_VERSION,
  type Clip,
  type Song,
  type SongRow,
} from './song'
import { isPitch } from '../audio/scale'
import { STEPS_PER_MEASURE, clampBpm } from '../audio/timing'

/**
 * Turns whatever came back out of storage into a Pattern this build can use,
 * or null if it cannot be salvaged.
 *
 * Saved patterns outlive the code that wrote them, so nothing here trusts the
 * input: every field is checked, and the track list is rebuilt from the current
 * kit rather than taken as read. That last part is the real reason this layer
 * exists -- adding or reordering a drum must not corrupt existing saves.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** Coerces saved steps to the right length and range for `measures`. */
function normaliseSteps(value: unknown, measures: number): number[] {
  const length = measures * STEPS_PER_MEASURE
  const source = Array.isArray(value) ? value : []

  return Array.from({ length }, (_, i) => {
    const step = source[i]
    // Booleans are accepted so a pre-velocity save would still load.
    if (step === true) return 1
    if (typeof step !== 'number' || !Number.isFinite(step)) return 0
    return Math.min(1, Math.max(0, step))
  })
}

function migrateTracks(value: unknown, measures: number): Track[] {
  const saved = Array.isArray(value) ? value : []

  return VOICE_IDS.map((voiceId) => {
    const match = saved.find((t) => isRecord(t) && t.voiceId === voiceId)
    const record = isRecord(match) ? match : {}

    return {
      voiceId,
      level: Math.min(1, Math.max(0, asNumber(record.level, getVoice(voiceId).defaultLevel))),
      muted: record.muted === true,
      steps: normaliseSteps(record.steps, measures),
    }
  })
}

/**
 * Notes are dropped rather than repaired when their position makes no sense --
 * a note at a pitch this build does not have, or starting past the end of the
 * pattern, has no correct interpretation. Length is clamped, since a note
 * running off the end has an obvious one.
 */
function migrateNotes(value: unknown, length: number): Note[] {
  const source = Array.isArray(value) ? value : []
  const notes: Note[] = []

  for (const raw of source) {
    if (!isRecord(raw)) continue

    const pitch = Math.round(asNumber(raw.pitch, -1))
    if (!isPitch(pitch)) continue

    const start = Math.floor(asNumber(raw.start, -1))
    if (!Number.isInteger(start) || start < 0 || start >= length) continue

    notes.push({
      id: asString(raw.id, createId()),
      pitch,
      start,
      length: Math.max(1, Math.min(length - start, Math.floor(asNumber(raw.length, 1)))),
      velocity: Math.min(1, Math.max(0, asNumber(raw.velocity, 1))),
    })
  }

  return notes
}

/** A pattern saved before the melody existed simply gets an empty one. */
function migrateMelody(value: unknown, length: number): Melody {
  const record = isRecord(value) ? value : {}
  return {
    level: Math.min(1, Math.max(0, asNumber(record.level, MELODY_DEFAULTS.level))),
    muted: record.muted === true,
    notes: migrateNotes(record.notes, length),
  }
}

export function migratePattern(raw: unknown): Pattern | null {
  if (!isRecord(raw)) return null

  // A pattern written by a newer build may mean things this one would get
  // wrong, so refuse it rather than silently mangling it.
  const version = asNumber(raw.version, 0)
  if (version > PATTERN_VERSION) return null

  const measures = Math.min(MAX_MEASURES, Math.max(1, Math.floor(asNumber(raw.measures, 1))))
  const now = Date.now()

  return {
    id: asString(raw.id, createId()),
    name: asString(raw.name, 'Untitled'),
    bpm: clampBpm(asNumber(raw.bpm, 110)),
    measures,
    tracks: migrateTracks(raw.tracks, measures),
    melody: migrateMelody(raw.melody, measures * STEPS_PER_MEASURE),
    version: PATTERN_VERSION,
    createdAt: asNumber(raw.createdAt, now),
    updatedAt: asNumber(raw.updatedAt, now),
  }
}

/* --- songs --------------------------------------------------------------- */

/**
 * The same contract for songs: anything unreadable is refused, anything
 * merely odd is repaired. A row naming a beat that no longer exists is *not*
 * odd -- it is expected, since beats and songs are deleted independently --
 * so the id is kept as written and the song screen shows the row as missing.
 */
function migrateClips(value: unknown, bars: number): Clip[] {
  const source = Array.isArray(value) ? value : []
  const clips: Clip[] = []

  for (const raw of source) {
    if (!isRecord(raw)) continue

    const start = Math.floor(asNumber(raw.start, -1))
    if (!Number.isInteger(start) || start < 0 || start >= bars) continue

    clips.push({
      id: asString(raw.id, createId()),
      start,
      length: Math.max(1, Math.min(bars - start, Math.floor(asNumber(raw.length, 1)))),
    })
  }

  return clips
}

function migrateRows(value: unknown, bars: number): SongRow[] {
  const source = Array.isArray(value) ? value : []
  const rows: SongRow[] = []

  for (const raw of source) {
    if (!isRecord(raw)) continue

    // A row with no beat behind it has nothing to play and nothing to fix.
    const patternId = asString(raw.patternId, '')
    if (!patternId) continue

    rows.push({
      id: asString(raw.id, createId()),
      patternId,
      level: Math.min(1, Math.max(0, asNumber(raw.level, ROW_DEFAULTS.level))),
      muted: raw.muted === true,
      clips: migrateClips(raw.clips, bars),
    })

    if (rows.length === MAX_SONG_ROWS) break
  }

  return rows
}

export function migrateSong(raw: unknown): Song | null {
  if (!isRecord(raw)) return null

  const version = asNumber(raw.version, 0)
  if (version > SONG_VERSION) return null

  const bars = Math.min(MAX_SONG_BARS, Math.max(1, Math.floor(asNumber(raw.bars, DEFAULT_SONG_BARS))))
  const now = Date.now()

  return {
    id: asString(raw.id, createId()),
    name: asString(raw.name, 'Untitled'),
    bpm: clampBpm(asNumber(raw.bpm, DEFAULT_SONG_BPM)),
    bars,
    rows: migrateRows(raw.rows, bars),
    version: SONG_VERSION,
    createdAt: asNumber(raw.createdAt, now),
    updatedAt: asNumber(raw.updatedAt, now),
  }
}
