import { describe, expect, it } from 'vitest'
import { bridgesGap, cellFill, pitchColor } from '../melodyCells'
import { draftFrom, type NotePreview } from '../noteEdits'
import { addNote, createEmptyPattern } from '../../state/schema'

const empty = createEmptyPattern().melody
const held = addNote(createEmptyPattern(), { pitch: 2, start: 4, length: 3 }).melody

function drawing(pitch: number, start: number, length: number): NotePreview {
  return { shape: { pitch, start, length }, editing: null }
}

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
  const preview = drawing(5, 1, 3)

  it('shows the preview', () => {
    expect(cellFill(empty, preview, 5, 1)).toMatchObject({ role: 'start', draft: true })
    expect(cellFill(empty, preview, 5, 3)).toMatchObject({ role: 'end', draft: true })
  })

  it('shows a single-step preview as one cell', () => {
    expect(cellFill(empty, drawing(5, 1, 1), 5, 1)?.role).toBe('single')
  })

  it('leaves other pitches alone', () => {
    expect(cellFill(empty, preview, 4, 1)).toBeNull()
  })

  it('wins over the note underneath, because committing will replace it', () => {
    expect(cellFill(held, drawing(2, 5, 2), 2, 5)).toMatchObject({ role: 'start', draft: true })
  })
})

describe('cellFill while a note is being edited', () => {
  const id = held.notes[0].id

  it('hides the note where it was, so it appears to move rather than clone', () => {
    const preview: NotePreview = { shape: { pitch: 2, start: 8, length: 3 }, editing: id }
    expect(cellFill(held, preview, 2, 4)).toBeNull()
    expect(cellFill(held, preview, 2, 8)).toMatchObject({ role: 'start', draft: true })
  })

  it('hides it even when it has been dragged to another row', () => {
    const preview: NotePreview = { shape: { pitch: 6, start: 4, length: 3 }, editing: id }
    expect(cellFill(held, preview, 2, 5)).toBeNull()
    expect(cellFill(held, preview, 6, 5)).toMatchObject({ role: 'middle', draft: true })
  })

  it('still shows notes that are not the one being edited', () => {
    const two = addNote(
      addNote(createEmptyPattern(), { pitch: 2, start: 4, length: 3 }),
      { pitch: 5, start: 0, length: 2 },
    ).melody
    const preview: NotePreview = { shape: { pitch: 2, start: 8, length: 3 }, editing: two.notes[0].id }
    expect(cellFill(two, preview, 5, 0)).toMatchObject({ draft: false })
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
