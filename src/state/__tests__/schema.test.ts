import { describe, expect, it } from 'vitest'
import {
  MAX_MEASURES,
  PATTERN_VERSION,
  addMeasure,
  addNote,
  canAddMeasure,
  canRemoveMeasure,
  createEmptyPattern,
  demoPattern,
  isStepOn,
  measureHasHits,
  noteAt,
  noteCovers,
  noteRole,
  removeMeasure,
  removeNote,
  setMelodyLevel,
  setMeasures,
  setPatternBpm,
  setStep,
  setTrackLevel,
  toggleMelodyMute,
  toggleMute,
  toggleStep,
  totalSteps,
} from '../schema'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { KIT } from '../../audio/kit'

describe('createEmptyPattern', () => {
  const pattern = createEmptyPattern()

  it('has one track per kit voice', () => {
    expect(pattern.tracks).toHaveLength(KIT.length)
    expect(pattern.tracks.map((t) => t.voiceId)).toEqual(KIT.map((v) => v.id))
  })

  it('starts as one silent measure', () => {
    expect(totalSteps(pattern)).toBe(STEPS_PER_MEASURE)
    for (const track of pattern.tracks) {
      expect(track.steps).toHaveLength(STEPS_PER_MEASURE)
      expect(track.steps.every((s) => s === 0)).toBe(true)
    }
  })

  it('stamps the format version, so old saves can be migrated later', () => {
    expect(pattern.version).toBe(PATTERN_VERSION)
  })

  it('gives each pattern its own id', () => {
    expect(createEmptyPattern().id).not.toBe(createEmptyPattern().id)
  })
})

describe('editing steps', () => {
  it('toggles a step on and back off', () => {
    const on = toggleStep(createEmptyPattern(), 0, 3)
    expect(isStepOn(on.tracks[0], 3)).toBe(true)
    expect(isStepOn(toggleStep(on, 0, 3).tracks[0], 3)).toBe(false)
  })

  it('leaves the original pattern untouched', () => {
    const before = createEmptyPattern()
    toggleStep(before, 0, 3)
    expect(isStepOn(before.tracks[0], 3)).toBe(false)
  })

  it('stores velocity, so accents can arrive without a format change', () => {
    const p = setStep(createEmptyPattern(), 0, 0, 0.5)
    expect(p.tracks[0].steps[0]).toBe(0.5)
    expect(isStepOn(p.tracks[0], 0)).toBe(true)
  })

  it('clamps velocity into 0..1', () => {
    expect(setStep(createEmptyPattern(), 0, 0, 9).tracks[0].steps[0]).toBe(1)
    expect(setStep(createEmptyPattern(), 0, 0, -9).tracks[0].steps[0]).toBe(0)
  })

  it('ignores steps beyond the end of the pattern', () => {
    const before = createEmptyPattern()
    expect(setStep(before, 0, 999, 1)).toBe(before)
  })

  it('ignores tracks that do not exist', () => {
    const before = createEmptyPattern()
    expect(toggleStep(before, 99, 0)).toBe(before)
  })
})

describe('track controls', () => {
  it('mutes and unmutes', () => {
    const muted = toggleMute(createEmptyPattern(), 1)
    expect(muted.tracks[1].muted).toBe(true)
    expect(toggleMute(muted, 1).tracks[1].muted).toBe(false)
  })

  it('clamps level into 0..1', () => {
    expect(setTrackLevel(createEmptyPattern(), 0, 5).tracks[0].level).toBe(1)
  })
})

describe('tempo', () => {
  it('clamps out-of-range tempos', () => {
    expect(setPatternBpm(createEmptyPattern(), 9999).bpm).toBeLessThanOrEqual(240)
  })
})

describe('measures', () => {
  it('pads every track with silence when growing', () => {
    const grown = addMeasure(toggleStep(createEmptyPattern(), 0, 0))
    expect(grown.measures).toBe(2)
    for (const track of grown.tracks) {
      expect(track.steps).toHaveLength(2 * STEPS_PER_MEASURE)
    }
    // The existing bar survives.
    expect(isStepOn(grown.tracks[0], 0)).toBe(true)
    expect(isStepOn(grown.tracks[0], STEPS_PER_MEASURE)).toBe(false)
  })

  it('truncates when shrinking', () => {
    const two = addMeasure(createEmptyPattern())
    const marked = toggleStep(two, 0, STEPS_PER_MEASURE + 2)
    const one = setMeasures(marked, 1)
    expect(one.tracks[0].steps).toHaveLength(STEPS_PER_MEASURE)
  })

  it('refuses to grow past the cap', () => {
    let pattern = createEmptyPattern()
    for (let i = 0; i < MAX_MEASURES + 3; i += 1) pattern = addMeasure(pattern)
    expect(pattern.measures).toBe(MAX_MEASURES)
    expect(canAddMeasure(pattern)).toBe(false)
  })

  it('never shrinks below one measure', () => {
    expect(setMeasures(createEmptyPattern(), 0).measures).toBe(1)
  })
})

describe('demoPattern', () => {
  const pattern = demoPattern()

  it('is not silent, so the first press of play does something', () => {
    const hits = pattern.tracks.flatMap((t) => t.steps).filter((s) => s > 0)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('puts a kick on the downbeat', () => {
    const kick = pattern.tracks.find((t) => t.voiceId === 'kick')!
    expect(isStepOn(kick, 0)).toBe(true)
  })
})

describe('removing a measure', () => {
  /** Marks step 0 of each measure so the survivors can be told apart. */
  function marked(measures: number) {
    let pattern = createEmptyPattern()
    for (let i = 1; i < measures; i += 1) pattern = addMeasure(pattern)
    for (let m = 0; m < measures; m += 1) {
      pattern = setStep(pattern, 0, m * STEPS_PER_MEASURE, (m + 1) / 10)
    }
    return pattern
  }

  it('shortens the pattern by one measure', () => {
    const shorter = removeMeasure(marked(3), 1)
    expect(shorter.measures).toBe(2)
    for (const track of shorter.tracks) {
      expect(track.steps).toHaveLength(2 * STEPS_PER_MEASURE)
    }
  })

  it('closes the gap, keeping the measures on either side', () => {
    const shorter = removeMeasure(marked(3), 1)
    // Measure 1 is gone; measure 3 slides down into its place.
    expect(shorter.tracks[0].steps[0]).toBeCloseTo(0.1)
    expect(shorter.tracks[0].steps[STEPS_PER_MEASURE]).toBeCloseTo(0.3)
  })

  it('can drop the first measure', () => {
    const shorter = removeMeasure(marked(3), 0)
    expect(shorter.tracks[0].steps[0]).toBeCloseTo(0.2)
  })

  it('can drop the last measure', () => {
    const shorter = removeMeasure(marked(3), 2)
    expect(shorter.tracks[0].steps[STEPS_PER_MEASURE]).toBeCloseTo(0.2)
  })

  it('trims every track, not just the one that was edited', () => {
    const shorter = removeMeasure(marked(2), 0)
    expect(shorter.tracks.every((t) => t.steps.length === STEPS_PER_MEASURE)).toBe(true)
  })

  it('refuses to remove the only measure', () => {
    const single = createEmptyPattern()
    expect(removeMeasure(single, 0)).toBe(single)
    expect(canRemoveMeasure(single)).toBe(false)
  })

  it('ignores a measure that does not exist', () => {
    const two = marked(2)
    expect(removeMeasure(two, 9)).toBe(two)
    expect(removeMeasure(two, -1)).toBe(two)
  })

  it('leaves the original pattern untouched', () => {
    const before = marked(2)
    removeMeasure(before, 0)
    expect(before.measures).toBe(2)
  })
})

describe('measureHasHits', () => {
  it('sees a hit anywhere in the measure, on any track', () => {
    const pattern = setStep(addMeasure(createEmptyPattern()), 3, STEPS_PER_MEASURE + 7, 1)
    expect(measureHasHits(pattern, 1)).toBe(true)
    expect(measureHasHits(pattern, 0)).toBe(false)
  })

  it('is false for a silent measure', () => {
    expect(measureHasHits(createEmptyPattern(), 0)).toBe(false)
  })
})

describe('melody notes', () => {
  const empty = createEmptyPattern()

  it('starts with no notes', () => {
    expect(empty.melody.notes).toEqual([])
  })

  it('adds a note with a start and a length', () => {
    const p = addNote(empty, { pitch: 2, start: 4, length: 3 })
    expect(p.melody.notes).toHaveLength(1)
    expect(p.melody.notes[0]).toMatchObject({ pitch: 2, start: 4, length: 3 })
  })

  it('covers exactly the steps it spans', () => {
    const note = addNote(empty, { pitch: 2, start: 4, length: 3 }).melody.notes[0]
    expect(noteCovers(note, 3)).toBe(false)
    expect(noteCovers(note, 4)).toBe(true)
    expect(noteCovers(note, 6)).toBe(true)
    expect(noteCovers(note, 7)).toBe(false)
  })

  it('replaces a note it overlaps, rather than stacking on top of it', () => {
    const first = addNote(empty, { pitch: 2, start: 4, length: 4 })
    const second = addNote(first, { pitch: 2, start: 6, length: 4 })
    expect(second.melody.notes).toHaveLength(1)
    expect(second.melody.notes[0].start).toBe(6)
  })

  it('leaves notes at other pitches alone', () => {
    const first = addNote(empty, { pitch: 2, start: 4, length: 4 })
    const second = addNote(first, { pitch: 3, start: 4, length: 4 })
    expect(second.melody.notes).toHaveLength(2)
  })

  it('keeps a neighbouring note that only touches, without overlapping', () => {
    const first = addNote(empty, { pitch: 1, start: 0, length: 4 })
    const second = addNote(first, { pitch: 1, start: 4, length: 4 })
    expect(second.melody.notes).toHaveLength(2)
  })

  it('refuses a pitch the scale does not have', () => {
    expect(addNote(empty, { pitch: 99, start: 0, length: 1 })).toBe(empty)
  })

  it('never lets a note run past the end of the pattern', () => {
    const p = addNote(empty, { pitch: 0, start: 14, length: 40 })
    const note = p.melody.notes[0]
    expect(note.start + note.length).toBeLessThanOrEqual(totalSteps(p))
  })

  it('never creates a note shorter than one step', () => {
    expect(addNote(empty, { pitch: 0, start: 0, length: 0 }).melody.notes[0].length).toBe(1)
  })

  it('removes by id', () => {
    const p = addNote(empty, { pitch: 2, start: 4, length: 3 })
    expect(removeNote(p, p.melody.notes[0].id).melody.notes).toEqual([])
  })

  it('ignores a removal of something that is not there', () => {
    expect(removeNote(empty, 'nope')).toBe(empty)
  })

  it('finds the note under a step', () => {
    const p = addNote(empty, { pitch: 2, start: 4, length: 3 })
    expect(noteAt(p.melody, 2, 5)).toBeDefined()
    expect(noteAt(p.melody, 2, 9)).toBeUndefined()
    expect(noteAt(p.melody, 3, 5)).toBeUndefined()
  })

  it('describes which part of a held note a step is', () => {
    const held = addNote(empty, { pitch: 0, start: 2, length: 3 }).melody.notes[0]
    expect(noteRole(held, 2)).toBe('start')
    expect(noteRole(held, 3)).toBe('middle')
    expect(noteRole(held, 4)).toBe('end')

    const single = addNote(empty, { pitch: 0, start: 2, length: 1 }).melody.notes[0]
    expect(noteRole(single, 2)).toBe('single')
  })

  it('mutes and sets the melody level', () => {
    expect(toggleMelodyMute(empty).melody.muted).toBe(true)
    expect(setMelodyLevel(empty, 5).melody.level).toBe(1)
  })
})

describe('melody survives measure changes', () => {
  function twoBars() {
    return addMeasure(createEmptyPattern())
  }

  it('drops notes left stranded when the pattern shrinks', () => {
    const p = addNote(twoBars(), { pitch: 0, start: STEPS_PER_MEASURE + 4, length: 2 })
    expect(setMeasures(p, 1).melody.notes).toEqual([])
  })

  it('truncates a note that would hang off the new end', () => {
    const p = addNote(twoBars(), { pitch: 0, start: STEPS_PER_MEASURE - 2, length: 8 })
    const shrunk = setMeasures(p, 1)
    const note = shrunk.melody.notes[0]
    expect(note.start + note.length).toBe(STEPS_PER_MEASURE)
  })

  it('slides notes back when an earlier measure is removed', () => {
    const p = addNote(twoBars(), { pitch: 1, start: STEPS_PER_MEASURE + 3, length: 2 })
    expect(removeMeasure(p, 0).melody.notes[0].start).toBe(3)
  })

  it('drops a note that was inside the removed measure', () => {
    const p = addNote(twoBars(), { pitch: 1, start: 3, length: 2 })
    expect(removeMeasure(p, 0).melody.notes).toEqual([])
  })

  it('drops a note straddling the cut, which has no sensible new length', () => {
    const p = addNote(twoBars(), { pitch: 1, start: STEPS_PER_MEASURE - 2, length: 6 })
    expect(removeMeasure(p, 1).melody.notes).toEqual([])
  })

  it('counts notes when deciding whether a measure is empty', () => {
    const p = addNote(twoBars(), { pitch: 1, start: STEPS_PER_MEASURE + 3, length: 2 })
    expect(measureHasHits(p, 1)).toBe(true)
    expect(measureHasHits(p, 0)).toBe(false)
  })
})
