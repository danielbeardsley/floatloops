import { describe, expect, it } from 'vitest'
import { KIT, VOICE_IDS, getVoice } from '../kit'

describe('kit', () => {
  it('has the nine sounds the grid expects', () => {
    expect(KIT).toHaveLength(9)
  })

  it('groups the drums before the synth voices', () => {
    const synths: string[] = ['bass', 'stab']
    const firstSynth = VOICE_IDS.findIndex((id) => synths.includes(id))
    expect(VOICE_IDS.slice(firstSynth)).toEqual(synths)
  })

  it('gives every voice a unique id', () => {
    expect(new Set(VOICE_IDS).size).toBe(KIT.length)
  })

  it('gives every voice a name, a colour and a sane default level', () => {
    for (const voice of KIT) {
      expect(voice.name.length).toBeGreaterThan(0)
      expect(voice.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(voice.defaultLevel).toBeGreaterThan(0)
      expect(voice.defaultLevel).toBeLessThanOrEqual(1)
    }
  })

  it('puts the kick first, because it is the one kids reach for', () => {
    expect(KIT[0].id).toBe('kick')
  })

  it('looks voices up by id', () => {
    expect(getVoice('bass').name).toBe('Bass')
  })

  it('throws on an unknown id rather than silently going quiet', () => {
    // @ts-expect-error deliberately invalid
    expect(() => getVoice('triangle')).toThrow(/unknown voice/i)
  })
})
