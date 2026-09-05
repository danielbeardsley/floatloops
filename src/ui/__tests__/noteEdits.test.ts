import { describe, expect, it } from 'vitest'
import { applyEdit, editModeFor, sameShape, type NoteShape } from '../noteEdits'

const TOTAL = 16

/** A note on pitch 3 covering steps 4, 5, 6. */
const note: NoteShape = { pitch: 3, start: 4, length: 3 }

function drag(mode: Parameters<typeof applyEdit>[1], grabStep: number, step: number, pitch = note.pitch) {
  return applyEdit(note, mode, grabStep, { pitch, step }, TOTAL)
}

describe('editModeFor', () => {
  it('maps each part of a note to what grabbing it means', () => {
    expect(editModeFor('start')).toBe('resize-start')
    expect(editModeFor('end')).toBe('resize-end')
    expect(editModeFor('middle')).toBe('move')
  })

  it('treats a one-step note as both edges at once', () => {
    expect(editModeFor('single')).toBe('resize-either')
  })
})

describe('dragging the right edge', () => {
  it('extends the note', () => {
    expect(drag('resize-end', 6, 9)).toEqual({ pitch: 3, start: 4, length: 6 })
  })

  it('shrinks it', () => {
    expect(drag('resize-end', 6, 5)).toEqual({ pitch: 3, start: 4, length: 2 })
  })

  it('leaves the start where it was', () => {
    expect(drag('resize-end', 6, 12).start).toBe(4)
  })

  it('stops at one step rather than inverting the note', () => {
    expect(drag('resize-end', 6, 0)).toEqual({ pitch: 3, start: 4, length: 1 })
  })

  it('will not run past the end of the pattern', () => {
    const shape = drag('resize-end', 6, 99)
    expect(shape.start + shape.length).toBe(TOTAL)
  })

  it('ignores the row the finger strays onto', () => {
    expect(drag('resize-end', 6, 8, 7).pitch).toBe(3)
  })
})

describe('dragging the left edge', () => {
  it('extends the note backwards', () => {
    expect(drag('resize-start', 4, 1)).toEqual({ pitch: 3, start: 1, length: 6 })
  })

  it('shrinks it', () => {
    expect(drag('resize-start', 4, 5)).toEqual({ pitch: 3, start: 5, length: 2 })
  })

  it('leaves the end where it was', () => {
    for (const step of [0, 2, 5, 6]) {
      const shape = drag('resize-start', 4, step)
      expect(shape.start + shape.length).toBe(7)
    }
  })

  it('stops at one step rather than inverting the note', () => {
    expect(drag('resize-start', 4, 12)).toEqual({ pitch: 3, start: 6, length: 1 })
  })

  it('will not run past the start of the pattern', () => {
    expect(drag('resize-start', 4, -5).start).toBe(0)
  })
})

describe('moving a note', () => {
  it('slides it by however far the finger travelled', () => {
    expect(drag('move', 5, 9)).toEqual({ pitch: 3, start: 8, length: 3 })
  })

  it('never changes its length', () => {
    for (const step of [0, 3, 9, 15]) {
      expect(drag('move', 5, step).length).toBe(note.length)
    }
  })

  it('follows the row under the finger, which is how a wrong note is fixed', () => {
    expect(drag('move', 5, 5, 7).pitch).toBe(7)
  })

  it('stops at the start of the pattern', () => {
    expect(drag('move', 5, 0).start).toBe(0)
  })

  it('stops at the end, keeping the whole note in view', () => {
    const shape = drag('move', 5, 15)
    expect(shape.start + shape.length).toBe(TOTAL)
  })

  it('is measured from where the note was grabbed, not from its start', () => {
    // Grabbing the middle cell and moving one step right moves the note one
    // step right, not back to the finger.
    expect(drag('move', 5, 6).start).toBe(5)
  })
})

describe('a one-step note', () => {
  const single: NoteShape = { pitch: 1, start: 8, length: 1 }

  function pull(step: number) {
    return applyEdit(single, 'resize-either', 8, { pitch: 1, step }, TOTAL)
  }

  it('grows to the right when pulled right', () => {
    expect(pull(11)).toEqual({ pitch: 1, start: 8, length: 4 })
  })

  it('grows to the left when pulled left', () => {
    expect(pull(5)).toEqual({ pitch: 1, start: 5, length: 4 })
  })

  it('is unchanged while the finger stays on it', () => {
    expect(pull(8)).toEqual(single)
  })
})

describe('sameShape', () => {
  it('compares all three of pitch, start and length', () => {
    expect(sameShape(note, { ...note })).toBe(true)
    expect(sameShape(note, { ...note, pitch: 4 })).toBe(false)
    expect(sameShape(note, { ...note, start: 5 })).toBe(false)
    expect(sameShape(note, { ...note, length: 4 })).toBe(false)
  })
})
