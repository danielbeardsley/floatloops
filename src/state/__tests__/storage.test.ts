import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { closeStorage, deletePattern, getPattern, listPatterns, savePattern } from '../storage'
import { createEmptyPattern, demoPattern, isStepOn, toggleStep } from '../schema'
import { KIT } from '../../audio/kit'

async function wipe() {
  await closeStorage()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('floatloops')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/** Writes a row straight past the storage layer, to simulate an old save. */
async function writeRaw(row: unknown) {
  const db = await openDB('floatloops', 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('patterns')) {
        const store = database.createObjectStore('patterns', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    },
  })
  await db.put('patterns', row)
  db.close()
  await closeStorage()
}

beforeEach(wipe)

afterEach(() => {
  vi.useRealTimers()
})

describe('saving and loading', () => {
  it('starts empty', async () => {
    expect(await listPatterns()).toEqual([])
  })

  it('reads back what it saved', async () => {
    const pattern = demoPattern()
    await savePattern(pattern)

    const loaded = await getPattern(pattern.id)
    expect(loaded?.name).toBe(pattern.name)
    expect(isStepOn(loaded!.tracks[0], 0)).toBe(true)
  })

  it('returns nothing for an id that was never saved', async () => {
    expect(await getPattern('nope')).toBeNull()
  })

  it('updates in place rather than duplicating', async () => {
    const pattern = demoPattern()
    await savePattern(pattern)
    await savePattern(toggleStep(pattern, 1, 2))

    const all = await listPatterns()
    expect(all).toHaveLength(1)
    expect(isStepOn(all[0].tracks[1], 2)).toBe(true)
  })

  it('stamps the save time, so the library can sort by it', async () => {
    const pattern = { ...demoPattern(), updatedAt: 0 }
    const saved = await savePattern(pattern)
    expect(saved.updatedAt).toBeGreaterThan(0)
  })

  it('lists the most recently edited first', async () => {
    // Only Date is faked: fake-indexeddb needs the real timer queue to settle.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(1_000))
    await savePattern({ ...createEmptyPattern('old'), id: 'a' })
    vi.setSystemTime(new Date(2_000))
    await savePattern({ ...createEmptyPattern('new'), id: 'b' })

    expect((await listPatterns()).map((p) => p.name)).toEqual(['new', 'old'])
  })

  it('deletes', async () => {
    const pattern = demoPattern()
    await savePattern(pattern)
    await deletePattern(pattern.id)
    expect(await listPatterns()).toEqual([])
  })

  it('shrugs off deleting something that is not there', async () => {
    await expect(deletePattern('nope')).resolves.toBeUndefined()
  })
})

describe('reading old or damaged saves', () => {
  it('repairs a save written before the kit had every drum', async () => {
    await writeRaw({
      id: 'legacy',
      name: 'Legacy',
      bpm: 90,
      measures: 1,
      version: 1,
      tracks: [{ voiceId: 'kick', level: 0.9, muted: false, steps: [1, 0, 0, 0] }],
      createdAt: 1,
      updatedAt: 1,
    })

    // The saved row predates most of the kit; it comes back with a track for
    // every drum this build has.
    const loaded = await getPattern('legacy')
    expect(loaded?.tracks).toHaveLength(KIT.length)
    expect(isStepOn(loaded!.tracks[0], 0)).toBe(true)
  })

  it('skips a row it cannot understand instead of failing the whole list', async () => {
    await savePattern({ ...demoPattern(), id: 'good' })
    await writeRaw({ id: 'from-the-future', version: 99 })

    const all = await listPatterns()
    expect(all.map((p) => p.id)).toEqual(['good'])
  })
})
