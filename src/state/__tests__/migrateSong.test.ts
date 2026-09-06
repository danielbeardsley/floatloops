import { describe, expect, it } from 'vitest'
import { migrateSong } from '../migrate'
import { MAX_SONG_BARS, MAX_SONG_ROWS, SONG_VERSION, createEmptySong } from '../song'

/** The shape a healthy save has, to vary one field at a time from. */
function saved(changes: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Opener',
    bpm: 120,
    bars: 4,
    rows: [{ id: 'r1', patternId: 'beat-1', level: 0.8, muted: false, clips: [{ id: 'c1', start: 0, length: 2 }] }],
    version: SONG_VERSION,
    createdAt: 1,
    updatedAt: 2,
    ...changes,
  }
}

describe('migrateSong', () => {
  it('reads a song back unchanged', () => {
    const song = migrateSong(saved())!
    expect(song.name).toBe('Opener')
    expect(song.bars).toBe(4)
    expect(song.rows[0].clips[0]).toMatchObject({ start: 0, length: 2 })
  })

  it('survives a round trip through itself', () => {
    const song = createEmptySong('Round Trip')
    expect(migrateSong(song)).toEqual(song)
  })

  it('refuses anything that is not an object', () => {
    expect(migrateSong(null)).toBeNull()
    expect(migrateSong('song')).toBeNull()
    expect(migrateSong([])).toBeNull()
  })

  // A song written by a newer build may mean things this one would get wrong.
  it('refuses a save from a newer build', () => {
    expect(migrateSong(saved({ version: SONG_VERSION + 1 }))).toBeNull()
  })

  it('clamps the tempo and the length', () => {
    const song = migrateSong(saved({ bpm: 9000, bars: 500 }))!
    expect(song.bpm).toBe(240)
    expect(song.bars).toBe(MAX_SONG_BARS)
  })

  it('gives a nameless song a name', () => {
    expect(migrateSong(saved({ name: 7 }))!.name).toBe('Untitled')
  })

  // Beats and songs are deleted independently, so a row naming a beat that is
  // gone is expected. The id is kept as written; the grid says it is missing.
  it('keeps a row whose beat is no longer in the library', () => {
    const song = migrateSong(saved({ rows: [{ patternId: 'deleted', clips: [] }] }))!
    expect(song.rows[0].patternId).toBe('deleted')
  })

  it('drops a row that names no beat at all', () => {
    expect(migrateSong(saved({ rows: [{ clips: [] }, 'nope', null] }))!.rows).toEqual([])
  })

  it('stops at the row cap', () => {
    const rows = Array.from({ length: MAX_SONG_ROWS + 4 }, (_, i) => ({ patternId: `b${i}` }))
    expect(migrateSong(saved({ rows }))!.rows).toHaveLength(MAX_SONG_ROWS)
  })

  it('fills in a row that is missing its level and mute', () => {
    const song = migrateSong(saved({ rows: [{ patternId: 'b' }] }))!
    expect(song.rows[0]).toMatchObject({ level: 1, muted: false })
    expect(song.rows[0].clips).toEqual([])
  })

  it('drops a clip that starts past the end of the song', () => {
    const rows = [{ patternId: 'b', clips: [{ start: 9, length: 1 }, { start: 1, length: 1 }] }]
    expect(migrateSong(saved({ rows }))!.rows[0].clips).toHaveLength(1)
  })

  // A clip running off the end has an obvious repair, unlike one starting off it.
  it('trims a clip that runs off the end', () => {
    const rows = [{ patternId: 'b', clips: [{ start: 3, length: 40 }] }]
    expect(migrateSong(saved({ rows }))!.rows[0].clips[0].length).toBe(1)
  })

  it('gives a clip an id when the save has none', () => {
    const rows = [{ patternId: 'b', clips: [{ start: 0, length: 1 }] }]
    expect(migrateSong(saved({ rows }))!.rows[0].clips[0].id).toBeTruthy()
  })
})
