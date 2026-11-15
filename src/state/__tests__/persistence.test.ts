import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isIosBrowserTab,
  requestPersistence,
  resetPersistenceRequest,
  storagePersistence,
} from '../persistence'

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })
}

beforeEach(resetPersistenceRequest)

afterEach(() => {
  stubStorage(undefined)
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
})

describe('asking to keep saved work', () => {
  it('asks once, and remembers the answer for the visit', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })

    expect(await requestPersistence()).toBe('persisted')
    expect(await requestPersistence()).toBe('persisted')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('does not ask again when it is already granted', async () => {
    const persist = vi.fn()
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist })

    expect(await requestPersistence()).toBe('persisted')
    expect(persist).not.toHaveBeenCalled()
  })

  it('reports a refusal', async () => {
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) })
    expect(await requestPersistence()).toBe('best-effort')
  })

  it('never throws, even when the browser does', async () => {
    stubStorage({ persisted: vi.fn().mockRejectedValue(new Error('no')), persist: vi.fn() })
    expect(await requestPersistence()).toBe('unknown')
    expect(await storagePersistence()).toBe('unknown')
  })

  it('shrugs where there is no storage manager at all', async () => {
    stubStorage(undefined)
    expect(await requestPersistence()).toBe('unknown')
    expect(await storagePersistence()).toBe('unknown')
  })

  it('reads the current state without asking', async () => {
    const persist = vi.fn()
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })

    expect(await storagePersistence()).toBe('best-effort')
    expect(persist).not.toHaveBeenCalled()
  })
})

describe('spotting Safari on iOS outside the Home Screen', () => {
  it.each([
    [false, true],
    [true, false],
    [undefined, false],
  ])('standalone %s means %s', (standalone, expected) => {
    Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true })
    expect(isIosBrowserTab()).toBe(expected)
  })
})
