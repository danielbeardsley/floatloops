import { describe, expect, it } from 'vitest'
import { applyEdit, editModeFor, hasGrip, sameShape, type NoteShape } from '../noteEdits'

const TOTAL = 16

/** A note on pitch 3 covering steps 4, 5, 6. */
const note: NoteShape = { pitch: 3, start: 4, length: 3 }

function drag(mode: Parameters<typeof applyEdit>[1], grabStep: number, step: number, pitch = note.pitch) {
  return applyEdit(note, mode, grabStep, { pitch, step }, TOTAL)
}

describe('editModeFor', () => {
  it('resizes from the handle at each end of the run', () => {
    expect(editModeFor('start', 'start')).toBe('resize-start')
    expect(editModeFor('end', 'end')).toBe('resize-end')
  })

  it('moves the note from anywhere the handles do not cover', () => {
    expect(editModeFor('start', 'body')).toBe('move')
    expect(editModeFor('middle', 'body')).toBe('move')
    expect(editModeFor('end', 'body')).toBe('move')
  })

  // This is the whole point: neither a one-step note nor a two-step one has a
  // middle, so under the old rule neither could be moved anywhere.
  it('gives a one-step note both handles and a middle', () => {
    expect(editModeFor('single', 'start')).toBe('resize-start')
    expect(editModeFor('single', 'end')).toBe('resize-end')
    expect(editModeFor('single', 'body')).toBe('move')
  })

  // The left handle of a note's last cell is not a thing.
  it('ignores a handle on the wrong end of the run', () => {
    expect(editModeFor('end', 'start')).toBe('move')
    expect(editModeFor('start', 'end')).toBe('move')
    expect(editModeFor('middle', 'start')).toBe('move')
    expect(editModeFor('middle', 'end')).toBe('move')
  })
})

describe('which cells carry a handle', () => {
  it('puts them only on the outer ends of a run', () => {
    expect(hasGrip('start', 'start')).toBe(true)
    expect(hasGrip('start', 'end')).toBe(false)
    expect(hasGrip('end', 'end')).toBe(true)
    expect(hasGrip('end', 'start')).toBe(false)
    expect(hasGrip('middle', 'start')).toBe(false)
    expect(hasGrip('middle', 'end')).toBe(false)
  })

  it('gives a one-step note both', () => {
    expect(hasGrip('single', 'start')).toBe(true)
    expect(hasGrip('single', 'end')).toBe(true)
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

describe('a one-step note, now that its ends are handles', () => {
  const single: NoteShape = { pitch: 1, start: 8, length: 1 }

  it('grows to the right from its end handle', () => {
    expect(applyEdit(single, 'resize-end', 8, { pitch: 1, step: 11 }, TOTAL)).toEqual({
      pitch: 1,
      start: 8,
      length: 4,
    })
  })

  it('grows to the left from its start handle', () => {
    expect(applyEdit(single, 'resize-start', 8, { pitch: 1, step: 5 }, TOTAL)).toEqual({
      pitch: 1,
      start: 5,
      length: 4,
    })
  })

  // What the handles are for: it used to be resizable from anywhere on it and
  // movable from nowhere.
  it('moves when it is dragged by its middle', () => {
    expect(applyEdit(single, 'move', 8, { pitch: 1, step: 12 }, TOTAL)).toEqual({
      pitch: 1,
      start: 12,
      length: 1,
    })
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
