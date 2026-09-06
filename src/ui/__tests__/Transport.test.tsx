import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Transport } from '../Transport'
import { usePatternStore } from '../../state/patternStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSongStore } from '../../state/songStore'
import { addRow, createEmptySong } from '../../state/song'
import { toggleStep, type Pattern } from '../../state/schema'
import { resetTransport } from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { demoPattern } from '../../state/schema'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

let mock: MockAudioContext

/** Lets the unlock() promise settle before assertions. */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  // Fake timers keep the scheduler's interval from running loose in jsdom.
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
  usePatternStore.setState({ pattern: demoPattern(), isPlaying: false })
  useLibraryStore.setState({ patterns: [], patternsById: new Map(), songs: [] })
  useSongStore.setState({ song: createEmptySong(), preview: null, isPlaying: false })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
})

describe('Transport', () => {
  it('offers to play before anything has started', () => {
    render(<Transport />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('unlocks audio on the first press of play', async () => {
    render(<Transport />)
    expect(mock.state).toBe('suspended')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()
    expect(mock.state).toBe('running')
  })

  it('starts the pattern and offers to stop', async () => {
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()

    expect(usePatternStore.getState().isPlaying).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    // The demo pattern is not silent, so the downbeat was scheduled.
    expect(mock.oscillators.length + mock.bufferSources.length).toBeGreaterThan(0)
  })

  it('stops again when pressed a second time', async () => {
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()

    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('changes the tempo', () => {
    render(<Transport />)
    fireEvent.change(screen.getByLabelText(/tempo in beats/i), { target: { value: '150' } })
    expect(usePatternStore.getState().pattern.bpm).toBe(150)
    expect(screen.getByText('150 bpm')).toBeInTheDocument()
  })
})


/** The beat's half of the unsaved marking the song transport already carries. */
describe('the unsaved mark', () => {
  const beat: Pattern = { ...demoPattern(), id: 'boom' }

  function library(saved: Pattern[]) {
    useLibraryStore.setState({
      patterns: saved,
      patternsById: new Map(saved.map((p) => [p.id, p])),
      songs: [],
    })
  }

  it('marks a beat the library has never heard of', () => {
    usePatternStore.setState({ pattern: beat })
    render(<Transport />)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  it('says nothing once the library has the same beat', () => {
    library([beat])
    usePatternStore.setState({ pattern: beat })
    render(<Transport />)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('marks it again as soon as it is edited', () => {
    library([beat])
    usePatternStore.setState({ pattern: toggleStep(beat, 2, 5) })
    render(<Transport />)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  // The way-back bar sits directly above and says the more useful half of it.
  it('leaves it to the way-back bar when the beat is in the open song', () => {
    library([beat])
    usePatternStore.setState({ pattern: toggleStep(beat, 2, 5) })
    useSongStore.setState({ song: addRow(createEmptySong(), beat.id) })
    render(<Transport />)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })
})
