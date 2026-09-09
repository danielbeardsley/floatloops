import { STEPS_PER_MEASURE, clampBpm } from '../audio/timing'
import { createId, type Pattern } from './schema'
import type { Arrangement, Voicing } from './arrangement'

/**
 * The saved-song format: an arrangement of beats over bars.
 *
 * A row is one beat from the library, referenced by id rather than copied, so
 * editing a beat updates every song that uses it. The cost is that a row can
 * outlive the beat it names; that is handled by treating a missing beat as a
 * silent, visibly-broken row rather than as a corrupt song.
 *
 * Every change here needs a bump to SONG_VERSION and a migration, because
 * these objects outlive the code that wrote them.
 */
export const SONG_VERSION = 1

export const DEFAULT_SONG_BPM = 110
export const DEFAULT_SONG_BARS = 8
export const MAX_SONG_BARS = 32

/**
 * Eight beats playing at once is already more than a tablet's speaker can tell
 * apart, and the grid stops fitting long before that.
 */
export const MAX_SONG_ROWS = 8

/**
 * A run of bars in which one beat plays. The beat loops inside it, so a
 * one-bar beat dragged out to four bars plays four times -- which is what
 * makes a song mostly a matter of dragging.
 */
export type Clip = {
  id: string
  /** Bar the clip begins on. */
  start: number
  /** How many bars it covers, at least one. */
  length: number
}

export type SongRow = {
  id: string
  /** The library beat this row plays. May no longer exist. */
  patternId: string
  level: number
  muted: boolean
  clips: Clip[]
}

export type Song = {
  id: string
  name: string
  /**
   * The song's tempo wins over each beat's own, or the music would lurch
   * every time a different beat came in.
   */
  bpm: number
  /** Length in bars. */
  bars: number
  rows: SongRow[]
  version: number
  createdAt: number
  updatedAt: number
}

export const ROW_DEFAULTS: Omit<SongRow, 'id' | 'patternId' | 'clips'> = {
  level: 1,
  muted: false,
}

export function createEmptySong(name = 'New Song'): Song {
  const now = Date.now()
  return {
    id: createId(),
    name,
    bpm: DEFAULT_SONG_BPM,
    bars: DEFAULT_SONG_BARS,
    rows: [],
    version: SONG_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

/** Every mutation goes through here, so updatedAt can never be forgotten. */
function revise(song: Song, changes: Partial<Song>): Song {
  return { ...song, ...changes, updatedAt: Date.now() }
}

function mapRow(song: Song, index: number, fn: (row: SongRow) => SongRow): Song {
  if (index < 0 || index >= song.rows.length) return song
  return revise(song, { rows: song.rows.map((row, i) => (i === index ? fn(row) : row)) })
}

export function songSteps(song: Song): number {
  return Math.max(1, song.bars) * STEPS_PER_MEASURE
}

/* --- rows ---------------------------------------------------------------- */

export function canAddRow(song: Song): boolean {
  return song.rows.length < MAX_SONG_ROWS
}

/** A new row starts empty: placing the first clip is a separate, undoable act. */
export function addRow(song: Song, patternId: string): Song {
  if (!canAddRow(song)) return song
  const row: SongRow = { id: createId(), patternId, ...ROW_DEFAULTS, clips: [] }
  return revise(song, { rows: [...song.rows, row] })
}

export function removeRow(song: Song, rowIndex: number): Song {
  if (rowIndex < 0 || rowIndex >= song.rows.length) return song
  return revise(song, { rows: song.rows.filter((_, i) => i !== rowIndex) })
}

/**
 * Points a row at a different beat, keeping its clips.
 *
 * What a fork needs: the row goes on playing in exactly the bars it did, and
 * only the beat underneath changes. Rebuilding the row instead would mean
 * drawing every clip again.
 */
export function setRowPattern(song: Song, rowIndex: number, patternId: string): Song {
  return mapRow(song, rowIndex, (row) => ({ ...row, patternId }))
}

export function setRowLevel(song: Song, rowIndex: number, level: number): Song {
  return mapRow(song, rowIndex, (row) => ({ ...row, level: Math.min(1, Math.max(0, level)) }))
}

export function toggleRowMute(song: Song, rowIndex: number): Song {
  return mapRow(song, rowIndex, (row) => ({ ...row, muted: !row.muted }))
}

export function rowHasClips(song: Song, rowIndex: number): boolean {
  return (song.rows[rowIndex]?.clips.length ?? 0) > 0
}

/* --- clips --------------------------------------------------------------- */

export function clipCovers(clip: Clip, bar: number): boolean {
  return bar >= clip.start && bar < clip.start + clip.length
}

export function clipAt(row: SongRow, bar: number): Clip | undefined {
  return row.clips.find((clip) => clipCovers(clip, bar))
}

/** Which part of a clip a bar is, so the cell can be drawn as one long block. */
export function clipRole(clip: Clip, bar: number): 'single' | 'start' | 'middle' | 'end' {
  const last = clip.start + clip.length - 1
  if (clip.start === last) return 'single'
  if (bar === clip.start) return 'start'
  if (bar === last) return 'end'
  return 'middle'
}

export type ClipDraft = { start: number; length: number }

function fit(song: Song, draft: ClipDraft): { start: number; length: number } {
  const start = Math.max(0, Math.min(song.bars - 1, Math.floor(draft.start)))
  return { start, length: Math.max(1, Math.min(song.bars - start, Math.floor(draft.length))) }
}

/**
 * Adds a clip, dropping anything it overlaps in the same row. Last write wins,
 * exactly as it does for notes: dragging across an existing clip replaces it
 * rather than leaving two fighting over the same bars.
 */
export function addClip(song: Song, rowIndex: number, draft: ClipDraft): Song {
  const { start, length } = fit(song, draft)
  const end = start + length

  return mapRow(song, rowIndex, (row) => ({
    ...row,
    clips: [
      ...row.clips.filter((clip) => clip.start + clip.length <= start || clip.start >= end),
      { id: createId(), start, length },
    ],
  }))
}

/** Moves or resizes a clip, keeping its identity. A clip never collides with itself. */
export function updateClip(song: Song, rowIndex: number, id: string, draft: ClipDraft): Song {
  const { start, length } = fit(song, draft)
  const end = start + length

  return mapRow(song, rowIndex, (row) => {
    const existing = row.clips.find((clip) => clip.id === id)
    if (!existing) return row

    return {
      ...row,
      clips: [
        ...row.clips.filter(
          (clip) =>
            clip.id !== id && (clip.start + clip.length <= start || clip.start >= end),
        ),
        { ...existing, start, length },
      ],
    }
  })
}

export function removeClip(song: Song, rowIndex: number, id: string): Song {
  return mapRow(song, rowIndex, (row) => {
    const clips = row.clips.filter((clip) => clip.id !== id)
    return clips.length === row.clips.length ? row : { ...row, clips }
  })
}

/* --- bars ---------------------------------------------------------------- */

export function setSongBpm(song: Song, bpm: number): Song {
  return revise(song, { bpm: clampBpm(bpm) })
}

export function renameSong(song: Song, name: string): Song {
  return revise(song, { name })
}

export function canAddBar(song: Song): boolean {
  return song.bars < MAX_SONG_BARS
}

export function canRemoveBar(song: Song): boolean {
  return song.bars > 1
}

export function addBar(song: Song): Song {
  if (!canAddBar(song)) return song
  return revise(song, { bars: song.bars + 1 })
}

/**
 * Cuts one bar out of the middle, closing the gap behind it.
 *
 * Unlike a melody note, a clip that straddles the cut is shortened rather than
 * dropped: the beat loops inside a clip, so every length is a valid one, and
 * losing eight bars of arrangement to remove one is no kind of edit.
 */
export function removeBar(song: Song, bar: number): Song {
  if (!canRemoveBar(song)) return song
  if (bar < 0 || bar >= song.bars) return song

  const rows = song.rows.map((row) => ({
    ...row,
    clips: row.clips.flatMap((clip) => {
      const end = clip.start + clip.length
      if (end <= bar) return [clip]
      if (clip.start > bar) return [{ ...clip, start: clip.start - 1 }]
      // The cut falls inside this clip. A one-bar clip has nothing left.
      return clip.length > 1 ? [{ ...clip, length: clip.length - 1 }] : []
    }),
  }))

  return revise(song, { bars: song.bars - 1, rows })
}

/** Whether a bar holds anything, so an empty one can be dropped silently. */
export function barHasClips(song: Song, bar: number): boolean {
  return song.rows.some((row) => row.clips.some((clip) => clipCovers(clip, bar)))
}

/* --- playback ------------------------------------------------------------ */

/**
 * Pure: every beat sounding at one step of the song.
 *
 * A row whose beat is missing from the library is skipped rather than treated
 * as an error -- a deleted beat should cost you that row, not the song.
 */
export function voicingsAt(
  song: Song,
  patterns: ReadonlyMap<string, Pattern>,
  step: number,
): Voicing[] {
  const bar = Math.floor(step / STEPS_PER_MEASURE)
  const stepInBar = step % STEPS_PER_MEASURE
  const voicings: Voicing[] = []

  for (const row of song.rows) {
    if (row.muted || row.level <= 0) continue

    const pattern = patterns.get(row.patternId)
    if (!pattern) continue

    const clip = clipAt(row, bar)
    if (!clip) continue

    // The beat loops inside the clip, so a one-bar beat fills however many
    // bars it was dragged across.
    const barOfPattern = (bar - clip.start) % pattern.measures
    voicings.push({
      pattern,
      step: barOfPattern * STEPS_PER_MEASURE + stepInBar,
      gain: row.level,
      melodyLevel: row.level,
    })
  }

  return voicings
}

export function songArrangement(
  song: Song,
  patterns: ReadonlyMap<string, Pattern>,
): Arrangement {
  return {
    bpm: song.bpm,
    steps: songSteps(song),
    at: (step) => voicingsAt(song, patterns, step),
  }
}
