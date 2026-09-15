import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MELODY_KEY,
  DEFAULT_MELODY_VIEW,
  isMelodyKey,
  isMelodyView,
  viewHasKey,
  visiblePitches,
  type MelodyView,
} from '../melodyView'
import { PITCH_COUNT, pitchName } from '../../audio/scale'
import type { Note } from '../schema'

function note(pitch: number): Note {
  return { id: `n${pitch}`, pitch, start: 0, length: 1, velocity: 1 }
}

function rows(
  view: MelodyView,
  { key = DEFAULT_MELODY_KEY, narrow = false, notes = [] as Note[] } = {},
) {
  return visiblePitches({ view, key, narrow, notes })
}

function names(pitches: number[]) {
  return pitches.map(pitchName)
}

describe('which rows the roll shows', () => {
  it('reads highest first, the way a piano roll is', () => {
    const all = rows('chromatic')
    expect(all).toHaveLength(PITCH_COUNT)
    expect(names(all).at(0)).toBe('B5')
    expect(names(all).at(-1)).toBe('C3')
  })

  it('shows the five that cannot clash, by default', () => {
    expect(DEFAULT_MELODY_VIEW).toBe('pentatonic')
    const pentatonic = names(rows('pentatonic'))

    expect(pentatonic).toHaveLength(15)
    expect(pentatonic.slice(-5)).toEqual(['A3', 'G3', 'E3', 'D3', 'C3'])
    expect(pentatonic).not.toContain('F3')
    expect(pentatonic).not.toContain('C#3')
  })

  it('shows the seven of a major scale, the eighth being the octave again', () => {
    const scale = names(rows('scale'))

    expect(scale.slice(-8)).toEqual(['C4', 'B3', 'A3', 'G3', 'F3', 'E3', 'D3', 'C3'])
    expect(scale).not.toContain('F#3')
  })

  it('transposes the scale views onto another key', () => {
    // G major: one sharp, and it is F#.
    const scale = names(rows('scale', { key: 7 }))
    expect(scale).toContain('F#3')
    expect(scale).not.toContain('F3')

    // The pentatonic rows move with it, being the same scale less two notes.
    const pentatonic = names(rows('pentatonic', { key: 7 }))
    expect(pentatonic.slice(-5)).toEqual(['B3', 'A3', 'G3', 'E3', 'D3'])
  })

  it('shows only the rows in use, once any are', () => {
    const notes = [note(1), note(13)]
    expect(rows('used', { notes })).toEqual([13, 1])
  })

  it('falls back to the safe rows when nothing is in use yet', () => {
    // Otherwise the roll has no rows at all, and no way to write the first note.
    expect(rows('used')).toEqual(rows('pentatonic'))
  })

  it('never hides a row that has a note on it', () => {
    // C#3 is in no key of C, and the note on it still has to be reachable.
    for (const view of ['pentatonic', 'scale', 'chromatic', 'used'] as const) {
      expect(rows(view, { notes: [note(1)] })).toContain(1)
    }
  })

  it('narrows to the notes that are there, keeping the view inside it', () => {
    const notes = [note(4), note(12)]
    const narrowed = rows('pentatonic', { narrow: true, notes })

    expect(narrowed.at(0)).toBe(12)
    expect(narrowed.at(-1)).toBe(4)
    expect(narrowed).toEqual([12, 9, 7, 4])
  })

  it('narrows around a note the view would not otherwise show', () => {
    const narrowed = rows('pentatonic', { narrow: true, notes: [note(1), note(4)] })
    expect(narrowed).toEqual([4, 2, 1])
  })

  it('has nothing to narrow to while the beat is empty', () => {
    expect(rows('chromatic', { narrow: true })).toEqual(rows('chromatic'))
  })
})

describe('reading a saved view back', () => {
  it('knows the views it has', () => {
    expect(isMelodyView('pentatonic')).toBe(true)
    expect(isMelodyView('dorian')).toBe(false)
    expect(isMelodyView(2)).toBe(false)
  })

  it('takes a key only inside the octave', () => {
    expect(isMelodyKey(0)).toBe(true)
    expect(isMelodyKey(11)).toBe(true)
    expect(isMelodyKey(12)).toBe(false)
    expect(isMelodyKey(-1)).toBe(false)
    expect(isMelodyKey(1.5)).toBe(false)
  })

  it('offers a key only where there is a scale to transpose', () => {
    expect(viewHasKey('pentatonic')).toBe(true)
    expect(viewHasKey('scale')).toBe(true)
    expect(viewHasKey('chromatic')).toBe(false)
    expect(viewHasKey('used')).toBe(false)
  })
})
