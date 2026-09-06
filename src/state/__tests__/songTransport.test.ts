import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSequencer, playSong, play, resetTransport, stop } from '../transport'
import { useLibraryStore } from '../libraryStore'
import { usePatternStore } from '../patternStore'
import { useSongStore } from '../songStore'
import { addClip, addRow, createEmptySong, setRowLevel, toggleRowMute } from '../song'
import {
  addNote,
  createEmptyPattern,
  setMelodyLevel,
  setStep,
  toggleMelodyMute,
  type Pattern,
} from '../schema'
import { STEPS_PER_MEASURE } from '../../audio/timing'
import { resetEngine, setContextFactory } from '../../audio/context'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/** A one-bar beat that is nothing but a kick on the downbeat. */
function kickBeat(id: string): Pattern {
  return { ...setStep(createEmptyPattern(id), 0, 0, 1), id }
}

/**
 * A one-bar beat with a single melody note and no drums at all, so the loudest
 * gain in the graph is unambiguously the melody's.
 */
function melodyBeat(id: string, level: number): Pattern {
  const pattern = setMelodyLevel(
    addNote(createEmptyPattern(id), { pitch: 3, start: 0, length: 2 }),
    level,
  )
  return { ...pattern, id }
}

function hits(): number {
  return mock.oscillators.length + mock.bufferSources.length
}

/** Runs the scheduler forward far enough to commit a whole bar of notes. */
function runOneBar(bpm = 110) {
  const seq = getSequencer()
  const step = (60 / bpm) / 4
  for (let i = 0; i < STEPS_PER_MEASURE; i += 1) {
    mock.currentTime += step
    seq.tick()
  }
}

/** The loudest gain the graph was ever asked for, which is the note's level. */
function loudest(): number {
  const values = mock.gains.flatMap((node) => node.gain.events.map((event) => event.value))
  return values.length === 0 ? 0 : Math.max(...values)
}

function freshEngine() {
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
}

beforeEach(() => {
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))

  const pattern = kickBeat('kick-beat')
  useLibraryStore.setState({
    patterns: [pattern],
    patternsById: new Map([[pattern.id, pattern]]),
    songs: [],
    loading: false,
    error: null,
  })
  usePatternStore.setState({ pattern: createEmptyPattern('Silent'), preview: null, isPlaying: false })
  useSongStore.setState({
    song: addClip(addRow(createEmptySong(), 'kick-beat'), 0, { start: 0, length: 2 }),
    preview: null,
    isPlaying: false,
  })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
})

describe('playing a song', () => {
  it('triggers the beats its rows name', async () => {
    await playSong()
    expect(hits()).toBeGreaterThan(0)
  })

  it('plays nothing from a muted row', async () => {
    useSongStore.setState({ song: toggleRowMute(useSongStore.getState().song, 0) })
    await playSong()
    runOneBar()
    expect(hits()).toBe(0)
  })

  it('is as long as the song, not as long as the beat in it', async () => {
    await playSong()
    const song = useSongStore.getState().song
    // currentStep wraps at the song's length; a one-bar beat would wrap at 16.
    expect(getSequencer().currentStep()).toBeLessThan(song.bars * STEPS_PER_MEASURE)
    expect(song.bars * STEPS_PER_MEASURE).toBeGreaterThan(STEPS_PER_MEASURE)
  })

  it('scales the beat by the row level', async () => {
    const song = useSongStore.getState().song

    await playSong()
    const full = loudest()
    expect(full).toBeGreaterThan(0)

    freshEngine()
    useSongStore.setState({ song: setRowLevel(song, 0, 0.5), isPlaying: false })
    await playSong()

    expect(loudest()).toBeCloseTo(full / 2, 4)
  })
})

describe('the row fader and a beat melody', () => {
  /** Puts one beat in the library and one row playing it, then starts. */
  async function playRowOf(pattern: Pattern, rowLevel: number) {
    freshEngine()
    useLibraryStore.setState({
      patterns: [pattern],
      patternsById: new Map([[pattern.id, pattern]]),
      songs: [],
      loading: false,
      error: null,
    })
    const row = setRowLevel(addRow(createEmptySong(), pattern.id), 0, rowLevel)
    useSongStore.setState({ song: addClip(row, 0, { start: 0, length: 1 }), isPlaying: false })
    await playSong()
    return loudest()
  }

  it('plays a beat on its own at the melody level it was written with', async () => {
    usePatternStore.setState({ pattern: melodyBeat('tune', 0.6), preview: null, isPlaying: false })
    await play()
    expect(loudest()).toBeCloseTo(0.6, 4)
  })

  // The row fader replaces the beat's melody level rather than scaling it, so
  // a row at full does not leave the melody stuck at whatever the beat said.
  it('takes over the melody level in a song', async () => {
    expect(await playRowOf(melodyBeat('tune', 0.6), 1)).toBeCloseTo(1, 4)
  })

  it('is the melody level, not a scale on it', async () => {
    // Scaling would give 0.6 * 0.5 = 0.3.
    expect(await playRowOf(melodyBeat('tune', 0.6), 0.5)).toBeCloseTo(0.5, 4)
  })

  it('lifts a quietly written melody as well as lowering a loud one', async () => {
    expect(await playRowOf(melodyBeat('tune', 0.2), 0.8)).toBeCloseTo(0.8, 4)
  })

  // Muting is not a level: a melody switched off inside its beat stays off.
  it('leaves a melody muted in its beat muted', async () => {
    const muted = toggleMelodyMute(melodyBeat('tune', 0.6))
    expect(await playRowOf({ ...muted, id: 'tune' }, 1)).toBe(0)
  })
})

describe('one timeline at a time', () => {
  it('stops the beat when a song starts', async () => {
    await play()
    expect(usePatternStore.getState().isPlaying).toBe(true)

    await playSong()
    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(useSongStore.getState().isPlaying).toBe(true)
  })

  it('stops the song when a beat starts', async () => {
    await playSong()
    await play()
    expect(useSongStore.getState().isPlaying).toBe(false)
    expect(usePatternStore.getState().isPlaying).toBe(true)
  })

  it('clears both when stopped', async () => {
    await playSong()
    stop()
    expect(useSongStore.getState().isPlaying).toBe(false)
    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(getSequencer().isRunning).toBe(false)
  })
})
