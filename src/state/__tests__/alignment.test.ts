import { describe, expect, it } from 'vitest'
import { alignmentKey, ghostsAt, placeNear, placesFor, type Place } from '../alignment'
import { addClip, addRow, createEmptySong, toggleRowMute, type Song } from '../song'
import {
  addNote,
  createEmptyPattern,
  setStep,
  toggleMelodyMute,
  toggleMute,
  type Pattern,
} from '../schema'
import { STEPS_PER_MEASURE } from '../../audio/timing'

const KICK = 0
const SNARE = 1

function beat(id: string, measures = 1): Pattern {
  return { ...createEmptyPattern(id, measures), id }
}

function library(...patterns: Pattern[]): ReadonlyMap<string, Pattern> {
  return new Map(patterns.map((pattern) => [pattern.id, pattern]))
}

/** A song of one row per (beat, clip), each clip filling the bars given. */
function songOf(...rows: { id: string; start: number; length: number }[]): Song {
  return rows.reduce(
    (song, row, index) => addClip(addRow(song, row.id), index, row),
    createEmptySong(),
  )
}

/** The steps of one track a ghost lights, for comparing without the noise. */
function lit(steps: readonly number[]): number[] {
  return steps.flatMap((velocity, step) => (velocity > 0 ? [step] : []))
}

function litNotes(steps: readonly boolean[]): number[] {
  return steps.flatMap((on, step) => (on ? [step] : []))
}

describe('the places a beat plays', () => {
  it('counts one per pass, not one per bar', () => {
    const places = placesFor(songOf({ id: 'mine', start: 0, length: 4 }), 'mine', 2)
    expect(places).toEqual<Place[]>([
      { bar: 0, time: 1, bars: 2 },
      { bar: 2, time: 2, bars: 2 },
    ])
  })

  it('gives a one-bar beat a place in every bar it covers', () => {
    const places = placesFor(songOf({ id: 'mine', start: 1, length: 3 }), 'mine', 1)
    expect(places.map((place) => place.bar)).toEqual([1, 2, 3])
  })

  it('says how few bars a pass gets when the clip cuts it short', () => {
    const places = placesFor(songOf({ id: 'mine', start: 0, length: 3 }), 'mine', 2)
    expect(places).toEqual<Place[]>([
      { bar: 0, time: 1, bars: 2 },
      { bar: 2, time: 2, bars: 1 },
    ])
  })

  it('numbers passes across every row playing the beat, in bar order', () => {
    const song = songOf(
      { id: 'mine', start: 4, length: 1 },
      { id: 'mine', start: 0, length: 1 },
    )
    expect(placesFor(song, 'mine', 1)).toEqual<Place[]>([
      { bar: 0, time: 1, bars: 1 },
      { bar: 4, time: 2, bars: 1 },
    ])
  })

  it('counts two rows starting it on the same bar once', () => {
    const song = songOf(
      { id: 'mine', start: 0, length: 1 },
      { id: 'mine', start: 0, length: 1 },
    )
    expect(placesFor(song, 'mine', 1)).toHaveLength(1)
  })

  it('has none for a beat the song does not play', () => {
    expect(placesFor(songOf({ id: 'other', start: 0, length: 4 }), 'mine', 1)).toEqual([])
  })
})

describe('the place a bar belongs to', () => {
  const places = placesFor(songOf({ id: 'mine', start: 0, length: 4 }), 'mine', 2)

  it('is the pass covering it, not the pass starting on it', () => {
    expect(placeNear(places, 3)?.bar).toBe(2)
  })

  it('falls back to the nearest pass when the bar is outside them all', () => {
    expect(placeNear(places, 7)?.bar).toBe(2)
  })

  it('has nothing to offer when the beat is not in the song', () => {
    expect(placeNear([], 3)).toBeUndefined()
  })
})

describe('what lines up against a pass', () => {
  const place = (bar: number, bars = 1): Place => ({ bar, time: 1, bars })

  it('puts a neighbour hit on the step of your beat it lands on', () => {
    const bass = setStep(beat('bass'), KICK, 8, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 0, length: 4 })

    const ghosts = ghostsAt(song, library(bass), 'mine', place(0), STEPS_PER_MEASURE)
    expect(ghosts.sources).toHaveLength(1)
    expect(lit(ghosts.sources[0].drums[KICK])).toEqual([8])
  })

  it('repeats a shorter neighbour across your longer beat', () => {
    const hats = setStep(beat('hats'), SNARE, 4, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'hats', start: 0, length: 4 })

    const ghosts = ghostsAt(song, library(hats), 'mine', place(0, 2), 2 * STEPS_PER_MEASURE)
    expect(lit(ghosts.sources[0].drums[SNARE])).toEqual([4, 20])
  })

  it('shows the bar of a longer neighbour that actually sounds here', () => {
    let bass = beat('bass', 2)
    bass = setStep(bass, KICK, 0, 1)
    bass = setStep(bass, KICK, STEPS_PER_MEASURE + 8, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 0, length: 4 })

    const first = ghostsAt(song, library(bass), 'mine', place(0), STEPS_PER_MEASURE)
    const second = ghostsAt(song, library(bass), 'mine', place(1), STEPS_PER_MEASURE)

    expect(lit(first.sources[0].drums[KICK])).toEqual([0])
    expect(lit(second.sources[0].drums[KICK])).toEqual([8])
  })

  it('follows the neighbour from its own clip start, not from the song start', () => {
    let bass = beat('bass', 2)
    bass = setStep(bass, KICK, STEPS_PER_MEASURE, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 1, length: 2 })

    // Bar 2 of the song is the second bar of the bassline's only pass.
    const ghosts = ghostsAt(song, library(bass), 'mine', place(2), STEPS_PER_MEASURE)
    expect(lit(ghosts.sources[0].drums[KICK])).toEqual([0])
  })

  it('leaves out the rows playing the beat being edited', () => {
    const mine = setStep(beat('mine'), KICK, 0, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'mine', start: 4, length: 4 })

    expect(ghostsAt(song, library(mine), 'mine', place(0), STEPS_PER_MEASURE).sources).toEqual([])
  })

  it('leaves out a row whose beat the library has lost', () => {
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'gone', start: 0, length: 4 })
    expect(ghostsAt(song, library(), 'mine', place(0), STEPS_PER_MEASURE).sources).toEqual([])
  })

  it('leaves out a row that is not playing at this place', () => {
    const bass = setStep(beat('bass'), KICK, 0, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 2, length: 2 })

    expect(ghostsAt(song, library(bass), 'mine', place(0), STEPS_PER_MEASURE).sources).toEqual([])
  })

  it('keeps a row the song has muted, and says that it is', () => {
    const bass = setStep(beat('bass'), KICK, 0, 1)
    const song = toggleRowMute(
      songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 0, length: 4 }),
      1,
    )

    const ghosts = ghostsAt(song, library(bass), 'mine', place(0), STEPS_PER_MEASURE)
    expect(ghosts.sources[0].muted).toBe(true)
    expect(lit(ghosts.sources[0].drums[KICK])).toEqual([0])
  })

  it('draws nothing for a track the neighbour has muted, since it sounds nothing', () => {
    let bass = setStep(beat('bass'), KICK, 0, 1)
    bass = setStep(bass, SNARE, 4, 1)
    bass = toggleMute(bass, KICK)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'bass', start: 0, length: 4 })

    const ghosts = ghostsAt(song, library(bass), 'mine', place(0), STEPS_PER_MEASURE)
    expect(lit(ghosts.sources[0].drums[KICK])).toEqual([])
    expect(lit(ghosts.sources[0].drums[SNARE])).toEqual([4])
  })

  it('stops at the point your beat stops playing', () => {
    const hats = setStep(beat('hats'), SNARE, 0, 1)
    const song = songOf({ id: 'mine', start: 0, length: 3 }, { id: 'hats', start: 0, length: 8 })

    const ghosts = ghostsAt(song, library(hats), 'mine', { bar: 2, time: 2, bars: 1 }, 32)
    expect(ghosts.playedSteps).toBe(STEPS_PER_MEASURE)
    expect(lit(ghosts.sources[0].drums[SNARE])).toEqual([0])
  })
})

describe('a neighbour melody', () => {
  const place = (bar: number, bars = 1): Place => ({ bar, time: 1, bars })

  it('lands on the pitch rows it is written on', () => {
    const tune = addNote(beat('tune'), { pitch: 3, start: 4, length: 4 })
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'tune', start: 0, length: 4 })

    const ghosts = ghostsAt(song, library(tune), 'mine', place(0), STEPS_PER_MEASURE)
    expect(litNotes(ghosts.sources[0].notes[3])).toEqual([4, 5, 6, 7])
    expect(litNotes(ghosts.sources[0].notes[2])).toEqual([])
  })

  it('is cut where the neighbour loops, exactly as it is heard', () => {
    const tune = addNote(beat('tune', 2), { pitch: 5, start: 12, length: 8 })
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'tune', start: 0, length: 4 })

    const first = ghostsAt(song, library(tune), 'mine', place(0), STEPS_PER_MEASURE)
    const second = ghostsAt(song, library(tune), 'mine', place(1), STEPS_PER_MEASURE)

    expect(litNotes(first.sources[0].notes[5])).toEqual([12, 13, 14, 15])
    expect(litNotes(second.sources[0].notes[5])).toEqual([0, 1, 2, 3])
  })

  it('draws nothing for a melody the neighbour has muted', () => {
    const tune = toggleMelodyMute(addNote(beat('tune'), { pitch: 3, start: 0, length: 2 }))
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'tune', start: 0, length: 4 })

    const ghosts = ghostsAt(song, library(tune), 'mine', place(0), STEPS_PER_MEASURE)
    expect(litNotes(ghosts.sources[0].notes[3])).toEqual([])
  })
})

describe('telling one place from another', () => {
  it('matches two passes that line up the same way', () => {
    const hats = setStep(beat('hats'), SNARE, 0, 1)
    const song = songOf({ id: 'mine', start: 0, length: 4 }, { id: 'hats', start: 0, length: 4 })
    const patterns = library(hats)
    const places = placesFor(song, 'mine', 1)

    const keys = places.map((place) =>
      alignmentKey(ghostsAt(song, patterns, 'mine', place, STEPS_PER_MEASURE)),
    )
    expect(new Set(keys).size).toBe(1)
  })

  it('separates the pass where the others land differently', () => {
    let bass = beat('bass', 3)
    bass = setStep(bass, KICK, 0, 1)
    bass = setStep(bass, KICK, 2 * STEPS_PER_MEASURE + 8, 1)
    const song = songOf({ id: 'mine', start: 0, length: 3 }, { id: 'bass', start: 0, length: 3 })
    const patterns = library(bass)

    const keys = placesFor(song, 'mine', 1).map((place) =>
      alignmentKey(ghostsAt(song, patterns, 'mine', place, STEPS_PER_MEASURE)),
    )
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })
})
