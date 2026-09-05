import { openDB, type IDBPDatabase } from 'idb'
import { migratePattern } from './migrate'
import type { Pattern } from './schema'

/**
 * Saved patterns live in IndexedDB on the device. No server, no accounts.
 *
 * Everything goes through this module so the backing store stays swappable,
 * and so every read passes through migratePattern -- nothing outside here ever
 * sees a raw stored object.
 */

const DB_NAME = 'floatloops'
const DB_VERSION = 1
const STORE = 'patterns'

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('updatedAt', 'updatedAt')
        }
      },
    })
  }
  return dbPromise
}

/** Most recently edited first, which is the order the library shows them in. */
export async function listPatterns(): Promise<Pattern[]> {
  const rows = await (await db()).getAll(STORE)
  return rows
    .map(migratePattern)
    .filter((p): p is Pattern => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getPattern(id: string): Promise<Pattern | null> {
  return migratePattern(await (await db()).get(STORE, id))
}

export async function savePattern(pattern: Pattern): Promise<Pattern> {
  const saved: Pattern = { ...pattern, updatedAt: Date.now() }
  await (await db()).put(STORE, saved)
  return saved
}

export async function deletePattern(id: string): Promise<void> {
  await (await db()).delete(STORE, id)
}

/**
 * Closes the connection and forgets it. Without the close, anything trying to
 * delete or upgrade the database blocks forever waiting on this handle.
 */
export async function closeStorage(): Promise<void> {
  const pending = dbPromise
  dbPromise = null
  if (pending) (await pending).close()
}
