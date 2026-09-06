import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { act, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { SequencerScreen } from '../SequencerScreen'
import { SongScreen } from '../SongScreen'
import { LibraryScreen } from '../LibraryScreen'
import { usePatternStore } from '../../state/patternStore'
import { useSongStore } from '../../state/songStore'
import { useLibraryStore } from '../../state/libraryStore'
import { useSettingsStore } from '../../state/settingsStore'
import {
  getSequencer,
  play,
  playPreview,
  playSong,
  resetTransport,
} from '../../state/transport'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern, demoPattern, type Pattern } from '../../state/schema'
import { addClip, addRow, createEmptySong } from '../../state/song'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const BEAT: Pattern = { ...demoPattern(), id: 'beat' }

function show(screen: ReactElement) {
  return render(<MemoryRouter>{screen}</MemoryRouter>)
}

/** Lets the unlock() promise and any library read settle. */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers()
  resetTransport()
  resetEngine()
  setContextFactory(() => asAudioContext(new MockAudioContext()))

  useLibraryStore.setState({
    patterns: [BEAT],
    patternsById: new Map([[BEAT.id, BEAT]]),
    songs: [],
    loading: false,
    error: null,
  })
  usePatternStore.setState({ pattern: demoPattern(), preview: null, isPlaying: false })
  useSongStore.setState({
    song: addClip(addRow(createEmptySong(), BEAT.id), 0, { start: 0, length: 2 }),
    preview: null,
    isPlaying: false,
  })
  useSettingsStore.setState({ followPlayhead: false, melodyOpen: false })
})

afterEach(() => {
  resetTransport()
  resetEngine()
  vi.useRealTimers()
})

/**
 * A beat playing on from a screen you have left has no playhead and no stop
 * button. The audio engine still survives navigation -- only the transport
 * stops.
 */
describe('leaving a screen', () => {
  it('stops a beat left playing on the sequencer', async () => {
    const view = show(<SequencerScreen />)
    await act(async () => {
      await play()
    })
    expect(usePatternStore.getState().isPlaying).toBe(true)

    view.unmount()
    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(getSequencer().isRunning).toBe(false)
  })

  it('stops a song left playing on the song screen', async () => {
    const view = show(<SongScreen />)
    await settle()
    await act(async () => {
      await playSong()
    })
    expect(useSongStore.getState().isPlaying).toBe(true)

    view.unmount()
    expect(useSongStore.getState().isPlaying).toBe(false)
    expect(getSequencer().isRunning).toBe(false)
  })

  it('stops a preview left playing in the library', async () => {
    const view = show(<LibraryScreen />)
    await settle()
    await act(async () => {
      await playPreview(BEAT)
    })
    expect(usePatternStore.getState().preview?.id).toBe(BEAT.id)

    view.unmount()
    expect(usePatternStore.getState().isPlaying).toBe(false)
    expect(usePatternStore.getState().preview).toBeNull()
  })

  it('leaves the audio engine standing, so the next play needs no unlock', async () => {
    const view = show(<SequencerScreen />)
    await act(async () => {
      await play()
    })
    const before = getSequencer()

    view.unmount()
    expect(getSequencer()).toBe(before)
  })

  // StrictMode mounts, unmounts and mounts again; the extra stop lands before
  // anything has been started.
  it('does not stop a beat the screen has only just started showing', async () => {
    show(<SequencerScreen />)
    await act(async () => {
      await play()
    })
    // A second screen mounting must not disturb the first.
    show(<SequencerScreen />)
    await settle()
    expect(usePatternStore.getState().isPlaying).toBe(true)
  })

  it('does not stop anything when nothing was playing', () => {
    const view = show(<SequencerScreen />)
    view.unmount()
    expect(usePatternStore.getState().pattern).toEqual(
      expect.objectContaining({ name: 'First Beat' }),
    )
  })
})

describe('what a stopped screen leaves behind', () => {
  it('keeps the beat that was open, so coming back finds it unchanged', async () => {
    const edited = createEmptyPattern('Half finished')
    usePatternStore.setState({ pattern: edited })

    const view = show(<SequencerScreen />)
    await act(async () => {
      await play()
    })
    view.unmount()

    expect(usePatternStore.getState().pattern).toBe(edited)
  })

  it('keeps the song that was open', async () => {
    const before = useSongStore.getState().song
    const view = show(<SongScreen />)
    await settle()
    await act(async () => {
      await playSong()
    })
    view.unmount()

    expect(useSongStore.getState().song).toBe(before)
  })
})
