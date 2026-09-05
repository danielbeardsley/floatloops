import { create } from 'zustand'
import { deletePattern, listPatterns, savePattern } from './storage'
import { createId, type Pattern } from './schema'

export type LibraryStore = {
  patterns: Pattern[]
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  save: (pattern: Pattern) => Promise<Pattern>
  remove: (id: string) => Promise<void>
  duplicate: (pattern: Pattern) => Promise<Pattern>
}

/**
 * Safari clears IndexedDB for sites that are not installed to the home screen,
 * so a read failing is a real possibility rather than a theoretical one. It
 * surfaces as an error the library screen can show, never as a crash.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not reach saved beats.'
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  patterns: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      set({ patterns: await listPatterns(), loading: false })
    } catch (error) {
      set({ error: describe(error), loading: false })
    }
  },

  save: async (pattern) => {
    const saved = await savePattern(pattern)
    await get().refresh()
    return saved
  },

  remove: async (id) => {
    await deletePattern(id)
    await get().refresh()
  },

  duplicate: async (pattern) => {
    const now = Date.now()
    const copy: Pattern = {
      ...pattern,
      id: createId(),
      name: `${pattern.name} copy`,
      createdAt: now,
      updatedAt: now,
    }
    return get().save(copy)
  },
}))
