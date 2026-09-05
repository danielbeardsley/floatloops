import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LibraryScreen } from '../LibraryScreen'
import { Transport } from '../Transport'
import { useLibraryStore } from '../../state/libraryStore'
import { usePatternStore } from '../../state/patternStore'
import { resetTransport } from '../../state/transport'
import { closeStorage, listPatterns } from '../../state/storage'
import { resetEngine, setContextFactory } from '../../audio/context'
import { createEmptyPattern, demoPattern } from '../../state/schema'
import { MockAudioContext, asAudioContext } from '../../test/mockAudioContext'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

let mock: MockAudioContext

function renderLibrary() {
  return render(
    <MemoryRouter>
      <LibraryScreen />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await closeStorage()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('floatloops')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })

  navigate.mockClear()
  resetTransport()
  resetEngine()
  mock = new MockAudioContext()
  setContextFactory(() => asAudioContext(mock))
  useLibraryStore.setState({ patterns: [], loading: false, error: null })
  usePatternStore.setState({ pattern: demoPattern(), preview: null, isPlaying: false })
})

afterEach(() => {
  // Stops the scheduler's interval, which a preview would otherwise leave running.
  resetTransport()
  resetEngine()
  vi.restoreAllMocks()
})

describe('an empty library', () => {
  it('says so, and says what to do about it', async () => {
    renderLibrary()
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
  })

  it('offers a fresh beat', async () => {
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'New beat' }))

    const pattern = usePatternStore.getState().pattern
    expect(pattern.tracks.every((t) => t.steps.every((s) => s === 0))).toBe(true)
    expect(navigate).toHaveBeenCalledWith('/')
  })
})

describe('a saved beat', () => {
  beforeEach(async () => {
    await useLibraryStore.getState().save({ ...demoPattern(), name: 'Boom Bap' })
  })

  it('is listed with its name and shape', async () => {
    renderLibrary()
    expect(await screen.findByText('Boom Bap')).toBeInTheDocument()
    expect(screen.getByLabelText('Pattern shape for Boom Bap')).toBeInTheDocument()
  })

  it('shows its length and tempo', async () => {
    renderLibrary()
    expect(await screen.findByText(/1 bar · 110 bpm/)).toBeInTheDocument()
  })

  it('opens into the sequencer', async () => {
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Boom Bap' }))

    expect(usePatternStore.getState().pattern.name).toBe('Boom Bap')
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('previews without opening, so the sequencer keeps what it had', async () => {
    usePatternStore.setState({ pattern: createEmptyPattern('Still Editing') })
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Play Boom Bap' }))

    await waitFor(() => expect(usePatternStore.getState().isPlaying).toBe(true))
    expect(usePatternStore.getState().preview?.name).toBe('Boom Bap')
    expect(usePatternStore.getState().pattern.name).toBe('Still Editing')
  })

  it('stops the preview again', async () => {
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Play Boom Bap' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop Boom Bap' }))

    await waitFor(() => expect(usePatternStore.getState().isPlaying).toBe(false))
    expect(usePatternStore.getState().preview).toBeNull()
  })

  it('duplicates', async () => {
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Boom Bap' }))
    expect(await screen.findByText('Boom Bap copy')).toBeInTheDocument()
  })

  it('asks before deleting', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Boom Bap' }))

    expect(confirm).toHaveBeenCalled()
    expect(await listPatterns()).toHaveLength(1)
  })

  it('deletes when the question is answered yes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLibrary()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Boom Bap' }))

    await waitFor(() => expect(screen.queryByText('Boom Bap')).not.toBeInTheDocument())
    expect(await listPatterns()).toHaveLength(0)
  })
})

describe('saving from the sequencer', () => {
  it('puts the beat in the library', async () => {
    usePatternStore.setState({ pattern: createEmptyPattern('My Beat') })
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await listPatterns()).toHaveLength(1))
    expect((await listPatterns())[0].name).toBe('My Beat')
  })

  it('confirms it saved', async () => {
    render(<Transport />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('updates in place instead of piling up copies', async () => {
    usePatternStore.setState({ pattern: createEmptyPattern('One Beat') })
    render(<Transport />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    fireEvent.click(await screen.findByRole('button', { name: /Save/ }))

    await waitFor(async () => expect(await listPatterns()).toHaveLength(1))
  })

  it('renames the beat', () => {
    render(<Transport />)
    fireEvent.change(screen.getByLabelText('Beat name'), { target: { value: 'Thunder' } })
    expect(usePatternStore.getState().pattern.name).toBe('Thunder')
  })
})
