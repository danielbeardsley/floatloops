import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { closeStorage, listPatterns } from '../storage'
import { createEmptyPattern, demoPattern, isStepOn } from '../schema'
import * as storage from '../storage'

async function wipe() {
  await closeStorage()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('floatloops')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  useLibraryStore.setState({ patterns: [], loading: false, error: null })
}

beforeEach(wipe)

describe('library store', () => {
  it('starts with nothing', async () => {
    await useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().patterns).toEqual([])
  })

  it('lists what has been saved', async () => {
    await useLibraryStore.getState().save(demoPattern())
    expect(useLibraryStore.getState().patterns).toHaveLength(1)
  })

  it('refreshes itself after a save, so the screen needs no prompting', async () => {
    const pattern = createEmptyPattern('Beat')
    await useLibraryStore.getState().save(pattern)
    expect(useLibraryStore.getState().patterns[0].name).toBe('Beat')
  })

  it('removes', async () => {
    const pattern = demoPattern()
    await useLibraryStore.getState().save(pattern)
    await useLibraryStore.getState().remove(pattern.id)
    expect(useLibraryStore.getState().patterns).toEqual([])
  })
})

describe('duplicate', () => {
  it('makes a separate copy rather than a second reference', async () => {
    const original = demoPattern()
    await useLibraryStore.getState().save(original)
    const copy = await useLibraryStore.getState().duplicate(original)

    expect(copy.id).not.toBe(original.id)
    expect(await listPatterns()).toHaveLength(2)
  })

  it('carries the steps across', async () => {
    const original = demoPattern()
    const copy = await useLibraryStore.getState().duplicate(original)
    expect(isStepOn(copy.tracks[0], 0)).toBe(true)
  })

  it('names the copy so the two can be told apart', async () => {
    const copy = await useLibraryStore.getState().duplicate(demoPattern())
    expect(copy.name).toMatch(/copy$/)
  })
})

describe('when storage is unavailable', () => {
  it('reports the problem instead of throwing', async () => {
    vi.spyOn(storage, 'listPatterns').mockRejectedValueOnce(new Error('Database closed'))
    await useLibraryStore.getState().refresh()

    expect(useLibraryStore.getState().error).toBe('Database closed')
    expect(useLibraryStore.getState().loading).toBe(false)
    vi.restoreAllMocks()
  })
})
