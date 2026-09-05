import { VOICE_IDS, getVoice } from '../audio/kit'
import { MAX_MEASURES, PATTERN_VERSION, createId, type Pattern, type Track } from './schema'
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
    version: PATTERN_VERSION,
    createdAt: asNumber(raw.createdAt, now),
    updatedAt: asNumber(raw.updatedAt, now),
  }
}
