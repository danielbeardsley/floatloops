import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SongTransport, Transport } from '../Transport'
import { usePatternStore } from '../../state/patternStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useSongStore } from '../../state/songStore'
import { addRow, createEmptySong, type Song } from '../../state/song'
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
  useSettingsStore.setState({ autoSave: true })
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
  it('leaves it to the way-back bar when the beat was opened from the song', () => {
    library([beat])
    const song = addRow(createEmptySong(), beat.id)
    useSongStore.setState({ song })
    usePatternStore.setState({ pattern: toggleStep(beat, 2, 5), fromSong: song.id })
    render(<Transport />)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  // No way-back bar on the library route, so nothing else would say it.
  it('says it itself when the same beat was opened from the library', () => {
    library([beat])
    useSongStore.setState({ song: addRow(createEmptySong(), beat.id) })
    usePatternStore.setState({ pattern: toggleStep(beat, 2, 5), fromSong: null })
    render(<Transport />)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })
})


/**
 * Auto-save is the Save button pressed for you, so these are all about *when*
 * it presses: after an edit, once the editing stops, and not otherwise.
 */
describe('auto-save', () => {
  /** Stands in for the library's save, and updates the store the way it does. */
  function stubSave() {
    const save = vi.fn(async (pattern: Pattern) => {
      const saved = { ...pattern, updatedAt: Date.now() }
      useLibraryStore.setState({ patterns: [saved], patternsById: new Map([[saved.id, saved]]) })
      return saved
    })
    useLibraryStore.setState({ save })
    return save
  }

  function stubSaveSong() {
    const saveSong = vi.fn(async (song: Song) => {
      const saved = { ...song, updatedAt: Date.now() }
      useLibraryStore.setState({ songs: [saved] })
      return saved
    })
    useLibraryStore.setState({ saveSong })
    return saveSong
  }

  /** Runs out the wait, letting the save's promises settle inside act. */
  async function waitOutTheDelay(ms = 800) {
    await act(async () => {
      vi.advanceTimersByTime(ms)
    })
  }

  function edit(bpm: number) {
    fireEvent.change(screen.getByLabelText(/tempo in beats/i), { target: { value: String(bpm) } })
  }

  it('saves an edit with nobody pressing Save', async () => {
    const save = stubSave()
    render(<Transport />)

    edit(150)
    await waitOutTheDelay()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].bpm).toBe(150)
  })

  it('clears the unsaved mark once it has saved', async () => {
    stubSave()
    render(<Transport />)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    edit(150)
    await waitOutTheDelay()

    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  // Otherwise opening the app files the starting beat under its demo name
  // before anyone has touched it.
  it('leaves an untouched beat out of the library', async () => {
    const save = stubSave()
    render(<Transport />)

    await waitOutTheDelay(5000)

    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  it('stays out of it when switched off', async () => {
    useSettingsStore.setState({ autoSave: false })
    const save = stubSave()
    render(<Transport />)

    edit(150)
    await waitOutTheDelay()

    expect(save).not.toHaveBeenCalled()
  })

  // A painted run of steps replaces the pattern on every cell the finger
  // crosses, and each save is a write plus a re-read of the whole library.
  it('saves once at the end of a burst, not once per edit', async () => {
    const save = stubSave()
    render(<Transport />)

    edit(150)
    await act(async () => void vi.advanceTimersByTime(200))
    edit(151)
    await act(async () => void vi.advanceTimersByTime(200))
    edit(152)
    await waitOutTheDelay()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].bpm).toBe(152)
  })

  it('picks up work already on screen when it is switched on', async () => {
    useSettingsStore.setState({ autoSave: false })
    const save = stubSave()
    render(<Transport />)

    edit(150)
    await waitOutTheDelay()
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Auto-save' }))
    await waitOutTheDelay()

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('remembers being switched off', () => {
    render(<Transport />)
    const toggle = screen.getByRole('button', { name: 'Auto-save' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(toggle)

    expect(useSettingsStore.getState().autoSave).toBe(false)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  // The song has the same Save button, so it gets the same treatment.
  it('saves the arrangement too', async () => {
    const saveSong = stubSaveSong()
    useSongStore.setState({ song: addRow(createEmptySong(), 'boom') })
    render(<SongTransport />)

    edit(150)
    await waitOutTheDelay()

    expect(saveSong).toHaveBeenCalledTimes(1)
    expect(saveSong.mock.calls[0][0].bpm).toBe(150)
  })

  // An empty arrangement has nothing to lose, and filing one under "New song"
  // would put a row of them in the library.
  it('leaves an empty arrangement alone', async () => {
    const saveSong = stubSaveSong()
    render(<SongTransport />)

    edit(150)
    await waitOutTheDelay()

    expect(saveSong).not.toHaveBeenCalled()
  })
})


/** The standing fact about a beat: who else is playing it. */
describe('the used-in notice', () => {
  const beat: Pattern = { ...demoPattern(), id: 'boom' }

  function songsPlayingIt(...names: string[]) {
    useLibraryStore.setState({ songs: names.map((name) => addRow(createEmptySong(name), 'boom')) })
    usePatternStore.setState({ pattern: beat })
  }

  it('says nothing while no song plays the beat', () => {
    usePatternStore.setState({ pattern: beat })
    render(<Transport />)
    expect(screen.queryByText(/used in/i)).not.toBeInTheDocument()
  })

  it('names the song while there is one to name', () => {
    songsPlayingIt('Rocket')
    render(<Transport />)
    expect(screen.getByText('Used in Rocket')).toBeInTheDocument()
  })

  it('counts them once there are several', () => {
    songsPlayingIt('Rocket', 'Bath Time', 'Dinosaurs')
    render(<Transport />)
    expect(screen.getByText('Used in 3 songs')).toBeInTheDocument()
  })

  // It is about the beat, not about this edit, so saving does not clear it.
  it('stays put alongside the unsaved mark', () => {
    songsPlayingIt('Rocket')
    render(<Transport />)
    expect(screen.getByText('Used in Rocket')).toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })
})
