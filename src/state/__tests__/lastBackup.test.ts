import { beforeEach, describe, expect, it } from 'vitest'
import {
  backupIsStale,
  daysSince,
  describeLastBackup,
  loadLastBackup,
  saveLastBackup,
} from '../lastBackup'

beforeEach(() => window.localStorage.clear())

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()

describe('the last backup', () => {
  it('is remembered', () => {
    expect(loadLastBackup()).toBeNull()
    saveLastBackup(1234)
    expect(loadLastBackup()).toBe(1234)
  })

  it('ignores a value it did not write', () => {
    window.localStorage.setItem('floatloops:lastBackup', 'soon')
    expect(loadLastBackup()).toBeNull()
  })

  it('counts calendar days, not stretches of 24 hours', () => {
    expect(daysSince(at(10, 23), at(11, 1))).toBe(1)
    expect(daysSince(at(10, 1), at(10, 23))).toBe(0)
  })

  it.each([
    [null, 'No backup saved on this device yet.'],
    [at(15), 'Last backup: today.'],
    [at(14), 'Last backup: yesterday.'],
    [at(1), 'Last backup: 14 days ago.'],
  ])('describes %s', (when, text) => {
    expect(describeLastBackup(when, at(15))).toBe(text)
  })

  it('goes stale after a fortnight, or if there never was one', () => {
    expect(backupIsStale(null, at(15))).toBe(true)
    expect(backupIsStale(at(2), at(15))).toBe(false)
    expect(backupIsStale(at(1), at(15))).toBe(true)
  })
})
