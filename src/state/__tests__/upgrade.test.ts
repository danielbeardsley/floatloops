import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDB, type IDBPDatabase } from 'idb'
import { closeStorage, listPatterns, listSongs, savePattern } from '../storage'
import { createEmptyPattern } from '../schema'

/**
 * The path no other test covers: a database that already exists at the version
 * before songs. Every other test starts from nothing, which is the one state a
 * device that has been used is never in.
 */
async function wipe() {
  await closeStorage()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('floatloops')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/**
 * A connection on the version before songs, of the kind an old tab leaves.
 * Tracked so the teardown can always close it: a connection left open blocks
 * the next test's wipe, which is the same trap in miniature.
 */
let stale: IDBPDatabase | null = null

async function openOldVersion() {
  stale = await openDB('floatloops', 1, {
    upgrade(database) {
      database.createObjectStore('patterns', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    },
  })
  return stale
}

function closeStale() {
  stale?.close()
  stale = null
}

beforeEach(wipe)
afterEach(closeStale)

describe('upgrading a database written before songs existed', () => {
  it('keeps the beats and gains an empty song list', async () => {
    const old = await openOldVersion()
    await old.put('patterns', createEmptyPattern('Existing'))
    closeStale()

    expect((await listPatterns()).map((p) => p.name)).toEqual(['Existing'])
    expect(await listSongs()).toEqual([])
  })

  // Waiting is IndexedDB's own answer to this, and it waits forever. A library
  // screen stuck on "Loading…" with nothing to say is the worst outcome here.
  it('gives up rather than hanging when another tab holds the old version', async () => {
    await openOldVersion()
    await expect(listPatterns()).rejects.toThrow(/another tab/i)
  }, 3000)

  it('says what to do about it', async () => {
    await openOldVersion()
    await expect(listPatterns()).rejects.toThrow(/reload/i)
  }, 3000)

  // The failure is not remembered, so closing the other tab and pressing on is
  // enough -- no reload of this one.
  it('recovers as soon as the other connection lets go', async () => {
    await openOldVersion()
    await expect(listPatterns()).rejects.toThrow()

    closeStale()
    await savePattern(createEmptyPattern('After'))
    expect((await listPatterns()).map((p) => p.name)).toEqual(['After'])
  }, 5000)

  // The other side of the standoff: this connection must not be what blocks a
  // future version from ever opening.
  it('lets go when a newer version wants in', async () => {
    await savePattern(createEmptyPattern('Existing'))

    const next = await openDB('floatloops', 99, {
      upgrade(database) {
        database.createObjectStore('later', { keyPath: 'id' })
      },
    })
    expect(next.version).toBe(99)
    next.close()
  }, 5000)
})
