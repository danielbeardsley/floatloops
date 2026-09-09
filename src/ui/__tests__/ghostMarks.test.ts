import { describe, expect, it } from 'vitest'
import type { GhostSource } from '../../state/alignment'
import { GHOST_MUTED, GHOST_NONE, GHOST_SOUNDING, ghostRole, mergeGhosts } from '../ghostMarks'

function source(id: string, over: Partial<GhostSource> = {}): GhostSource {
  return {
    rowId: id,
    patternId: `${id}-beat`,
    muted: false,
    drums: [new Array<number>(4).fill(0)],
    notes: [new Array<boolean>(4).fill(false)],
    ...over,
  }
}

function drums(...steps: number[]): number[][] {
  return [steps]
}

describe('merging the rows into marks', () => {
  it('lights a step any of them lands on', () => {
    const marks = mergeGhosts([
      source('a', { drums: drums(1, 0, 0, 0) }),
      source('b', { drums: drums(0, 0, 1, 0) }),
    ])
    expect(marks.drums[0]).toEqual([GHOST_SOUNDING, GHOST_NONE, GHOST_SOUNDING, GHOST_NONE])
  })

  it('whispers a row the song has muted rather than dropping it', () => {
    const marks = mergeGhosts([source('a', { muted: true, drums: drums(1, 0, 0, 0) })])
    expect(marks.drums[0][0]).toBe(GHOST_MUTED)
  })

  it('lets a sounding row win where the two land together', () => {
    const marks = mergeGhosts([
      source('a', { muted: true, drums: drums(1, 0, 0, 0) }),
      source('b', { drums: drums(1, 0, 0, 0) }),
    ])
    expect(marks.drums[0][0]).toBe(GHOST_SOUNDING)
  })

  it('leaves out the rows that have been hidden', () => {
    const marks = mergeGhosts(
      [source('a', { drums: drums(1, 0, 0, 0) }), source('b', { drums: drums(0, 1, 0, 0) })],
      new Set(['a']),
    )
    expect(marks.drums[0]).toEqual([GHOST_NONE, GHOST_SOUNDING, GHOST_NONE, GHOST_NONE])
  })

  it('merges the pitches the same way', () => {
    const marks = mergeGhosts([source('a', { notes: [[false, true, false, false]] })])
    expect(marks.notes[0]).toEqual([GHOST_NONE, GHOST_SOUNDING, GHOST_NONE, GHOST_NONE])
  })

  it('has nothing to say when every row is hidden', () => {
    const marks = mergeGhosts([source('a', { drums: drums(1, 1, 1, 1) })], new Set(['a']))
    expect(marks.drums).toEqual([])
  })
})

describe('how a run of ghosted steps is drawn', () => {
  const run = [0, 2, 2, 2, 0, 2]

  it('rounds the outer ends of a run and squares the inside', () => {
    expect([1, 2, 3].map((step) => ghostRole(run, step))).toEqual(['start', 'middle', 'end'])
  })

  it('calls a lone step what it is', () => {
    expect(ghostRole(run, 5)).toBe('single')
  })

  it('has no role for a step nothing lands on', () => {
    expect(ghostRole(run, 0)).toBeNull()
  })

  it('has none for a lane no beat reaches at all', () => {
    expect(ghostRole(undefined, 0)).toBeNull()
  })
})
