import { describe, expect, it } from 'vitest'
import { bridgesGap, cellFill, pitchColor } from '../melodyCells'
import { draftFrom } from '../useNoteDrawer'
import { addNote, createEmptyPattern } from '../../state/schema'

const empty = createEmptyPattern().melody
const held = addNote(createEmptyPattern(), { pitch: 2, start: 4, length: 3 }).melody

describe('cellFill', () => {
  it('is empty where there is no note', () => {
    expect(cellFill(empty, null, 0, 0)).toBeNull()
    expect(cellFill(held, null, 2, 9)).toBeNull()
    expect(cellFill(held, null, 3, 5)).toBeNull()
  })

  it('describes each part of a held note', () => {
    expect(cellFill(held, null, 2, 4)?.role).toBe('start')
    expect(cellFill(held, null, 2, 5)?.role).toBe('middle')
    expect(cellFill(held, null, 2, 6)?.role).toBe('end')
  })

  it('carries the note id, so a tap knows what to delete', () => {
    expect(cellFill(held, null, 2, 5)?.noteId).toBe(held.notes[0].id)
  })
})

describe('cellFill while a note is being drawn', () => {
  const draft = { pitch: 5, start: 1, length: 3 }

  it('shows the draft', () => {
    expect(cellFill(empty, draft, 5, 1)).toMatchObject({ role: 'start', draft: true })
    expect(cellFill(empty, draft, 5, 3)).toMatchObject({ role: 'end', draft: true })
  })

  it('shows a single-step draft as one cell', () => {
    expect(cellFill(empty, { pitch: 5, start: 1, length: 1 }, 5, 1)?.role).toBe('single')
  })

  it('leaves other pitches alone', () => {
    expect(cellFill(empty, draft, 4, 1)).toBeNull()
  })

  it('wins over the note underneath, because committing will replace it', () => {
    const overlapping = { pitch: 2, start: 5, length: 2 }
    const fill = cellFill(held, overlapping, 2, 5)
    expect(fill).toMatchObject({ role: 'start', draft: true })
  })
})

describe('bridgesGap', () => {
  it('bridges everywhere the note continues', () => {
    expect(bridgesGap(cellFill(held, null, 2, 4))).toBe(true)
    expect(bridgesGap(cellFill(held, null, 2, 5))).toBe(true)
  })

  it('stops at the last cell, so the bar ends where the note does', () => {
    expect(bridgesGap(cellFill(held, null, 2, 6))).toBe(false)
    expect(bridgesGap(null)).toBe(false)
  })
})

describe('draftFrom', () => {
  it('grows to the right as the drag goes on', () => {
    expect(draftFrom(1, 4, 4)).toEqual({ pitch: 1, start: 4, length: 1 })
    expect(draftFrom(1, 4, 7)).toEqual({ pitch: 1, start: 4, length: 4 })
  })

  it('does not run backwards when the drag goes left', () => {
    expect(draftFrom(1, 4, 0).length).toBe(1)
  })
})

describe('pitchColor', () => {
  it('gives every pitch its own colour, so height is readable at a glance', () => {
    const colors = [0, 1, 2, 3, 4, 5, 6, 7].map(pitchColor)
    expect(new Set(colors).size).toBe(colors.length)
  })
})
