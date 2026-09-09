import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SONG_BARS,
  MAX_SONG_BARS,
  MAX_SONG_ROWS,
  addBar,
  addClip,
  addRow,
  barHasClips,
  canAddBar,
  canAddRow,
  canRemoveBar,
  clipAt,
  clipRole,
  createEmptySong,
  removeBar,
  removeClip,
  removeRow,
  setRowLevel,
  setRowPattern,
  setSongBpm,
  songArrangement,
  songSteps,
  toggleRowMute,
  updateClip,
  voicingsAt,
  type Song,
} from '../song'
import { createEmptyPattern, setStep, type Pattern } from '../schema'
import { STEPS_PER_MEASURE } from '../../audio/timing'

/** A beat of `measures` bars with a kick on the downbeat of each. */
function beat(id: string, measures = 1): Pattern {
  let pattern: Pattern = { ...createEmptyPattern(id, measures), id }
  for (let bar = 0; bar < measures; bar += 1) {
    pattern = setStep(pattern, 0, bar * STEPS_PER_MEASURE, 1)
  }
  return pattern
}

function library(...patterns: Pattern[]): Map<string, Pattern> {
  return new Map(patterns.map((pattern) => [pattern.id, pattern]))
}

/** A song with one row of `patternId`, holding one clip. */
function songWith(patternId: string, start: number, length: number): Song {
  return addClip(addRow(createEmptySong(), patternId), 0, { start, length })
}

describe('a new song', () => {
  it('starts with no rows', () => {
    expect(createEmptySong().rows).toEqual([])
  })

  it('is long enough to arrange something in', () => {
    expect(createEmptySong().bars).toBe(DEFAULT_SONG_BARS)
  })

  it('is sixteen steps per bar long', () => {
    expect(songSteps(createEmptySong())).toBe(DEFAULT_SONG_BARS * STEPS_PER_MEASURE)
  })
})

describe('rows', () => {
  it('names the beat rather than copying it', () => {
    const song = addRow(createEmptySong(), 'beat-1')
    expect(song.rows[0].patternId).toBe('beat-1')
    expect(song.rows[0]).not.toHaveProperty('pattern')
  })

  it('starts a row empty, so placing the first block is its own act', () => {
    expect(addRow(createEmptySong(), 'beat-1').rows[0].clips).toEqual([])
  })

  it('lets the same beat appear on two rows', () => {
    const song = addRow(addRow(createEmptySong(), 'beat-1'), 'beat-1')
    expect(song.rows).toHaveLength(2)
    expect(song.rows[0].id).not.toBe(song.rows[1].id)
  })

  it('stops adding rows at the cap', () => {
    let song = createEmptySong()
    for (let i = 0; i < MAX_SONG_ROWS + 3; i += 1) song = addRow(song, `beat-${i}`)
    expect(song.rows).toHaveLength(MAX_SONG_ROWS)
    expect(canAddRow(song)).toBe(false)
  })

  it('removes a row without disturbing the others', () => {
    let song = addRow(addRow(addRow(createEmptySong(), 'a'), 'b'), 'c')
    song = removeRow(song, 1)
    expect(song.rows.map((row) => row.patternId)).toEqual(['a', 'c'])
  })

  it('mutes and unmutes a row', () => {
    const song = toggleRowMute(addRow(createEmptySong(), 'a'), 0)
    expect(song.rows[0].muted).toBe(true)
    expect(toggleRowMute(song, 0).rows[0].muted).toBe(false)
  })

  it('clamps a row level to the usable range', () => {
    const song = addRow(createEmptySong(), 'a')
    expect(setRowLevel(song, 0, 5).rows[0].level).toBe(1)
    expect(setRowLevel(song, 0, -2).rows[0].level).toBe(0)
  })

  it('ignores an edit to a row that is not there', () => {
    const song = createEmptySong()
    expect(toggleRowMute(song, 3)).toBe(song)
  })
})

describe('clips', () => {
  it('covers the bars it was drawn across', () => {
    const song = songWith('a', 2, 3)
    const row = song.rows[0]
    expect(clipAt(row, 1)).toBeUndefined()
    expect(clipAt(row, 2)).toBeDefined()
    expect(clipAt(row, 4)).toBeDefined()
    expect(clipAt(row, 5)).toBeUndefined()
  })

  it('reads as one block from end to end', () => {
    const clip = songWith('a', 0, 3).rows[0].clips[0]
    expect(clipRole(clip, 0)).toBe('start')
    expect(clipRole(clip, 1)).toBe('middle')
    expect(clipRole(clip, 2)).toBe('end')
  })

  it('calls a one-bar clip both ends at once', () => {
    const clip = songWith('a', 0, 1).rows[0].clips[0]
    expect(clipRole(clip, 0)).toBe('single')
  })

  it('never runs off the end of the song', () => {
    const song = songWith('a', DEFAULT_SONG_BARS - 2, 10)
    expect(song.rows[0].clips[0].length).toBe(2)
  })

  it('replaces what it overlaps rather than stacking', () => {
    let song = songWith('a', 0, 2)
    song = addClip(song, 0, { start: 1, length: 2 })
    expect(song.rows[0].clips).toHaveLength(1)
    expect(song.rows[0].clips[0]).toMatchObject({ start: 1, length: 2 })
  })

  it('leaves a clip it does not touch alone', () => {
    let song = songWith('a', 0, 2)
    song = addClip(song, 0, { start: 4, length: 2 })
    expect(song.rows[0].clips).toHaveLength(2)
  })

  it('does not let a clip collide with itself when resized', () => {
    const song = songWith('a', 1, 2)
    const { id } = song.rows[0].clips[0]
    const resized = updateClip(song, 0, id, { start: 1, length: 4 })
    expect(resized.rows[0].clips).toHaveLength(1)
    expect(resized.rows[0].clips[0].id).toBe(id)
    expect(resized.rows[0].clips[0].length).toBe(4)
  })

  it('drops a clip a move lands on top of', () => {
    let song = songWith('a', 0, 1)
    song = addClip(song, 0, { start: 3, length: 1 })
    const moving = song.rows[0].clips.find((clip) => clip.start === 0)!
    const after = updateClip(song, 0, moving.id, { start: 3, length: 1 })
    expect(after.rows[0].clips).toHaveLength(1)
    expect(after.rows[0].clips[0].id).toBe(moving.id)
  })

  it('removes a clip by id', () => {
    const song = songWith('a', 0, 2)
    expect(removeClip(song, 0, song.rows[0].clips[0].id).rows[0].clips).toEqual([])
  })

  it('ignores a remove for an id that is not there', () => {
    const song = songWith('a', 0, 2)
    expect(removeClip(song, 0, 'nope').rows[0].clips).toHaveLength(1)
  })
})

describe('bars', () => {
  it('grows and stops at the cap', () => {
    let song = createEmptySong()
    while (canAddBar(song)) song = addBar(song)
    expect(song.bars).toBe(MAX_SONG_BARS)
    expect(addBar(song)).toBe(song)
  })

  it('will not shrink below one bar', () => {
    let song: Song = { ...createEmptySong(), bars: 1 }
    expect(canRemoveBar(song)).toBe(false)
    song = removeBar(song, 0)
    expect(song.bars).toBe(1)
  })

  it('slides later clips back to close the gap', () => {
    const song = removeBar(songWith('a', 4, 2), 0)
    expect(song.rows[0].clips[0]).toMatchObject({ start: 3, length: 2 })
  })

  it('leaves earlier clips where they are', () => {
    const song = removeBar(songWith('a', 0, 2), 5)
    expect(song.rows[0].clips[0]).toMatchObject({ start: 0, length: 2 })
  })

  // Unlike a melody note, a clip loops its beat, so every length is valid --
  // there is no reason to throw away seven bars to remove one.
  it('shortens a clip the cut falls inside rather than dropping it', () => {
    const song = removeBar(songWith('a', 0, 4), 2)
    expect(song.rows[0].clips[0]).toMatchObject({ start: 0, length: 3 })
  })

  it('drops a one-bar clip when its own bar goes', () => {
    const song = removeBar(songWith('a', 2, 1), 2)
    expect(song.rows[0].clips).toEqual([])
  })

  it('knows which bars hold something', () => {
    const song = songWith('a', 2, 2)
    expect(barHasClips(song, 1)).toBe(false)
    expect(barHasClips(song, 2)).toBe(true)
    expect(barHasClips(song, 3)).toBe(true)
    expect(barHasClips(song, 4)).toBe(false)
  })

  it('clamps the tempo', () => {
    expect(setSongBpm(createEmptySong(), 5000).bpm).toBeLessThanOrEqual(240)
  })
})

describe('what plays when', () => {
  const patterns = library(beat('a'), beat('b', 2))

  it('plays nothing where there is no clip', () => {
    expect(voicingsAt(songWith('a', 2, 1), patterns, 0)).toEqual([])
  })

  it('plays the beat under the playhead', () => {
    const voicings = voicingsAt(songWith('a', 0, 1), patterns, 3)
    expect(voicings).toHaveLength(1)
    expect(voicings[0].pattern.id).toBe('a')
    expect(voicings[0].step).toBe(3)
  })

  it('loops a one-bar beat through a longer clip', () => {
    const song = songWith('a', 0, 4)
    // Third bar of the clip, fifth step of that bar.
    const step = 2 * STEPS_PER_MEASURE + 5
    expect(voicingsAt(song, patterns, step)[0].step).toBe(5)
  })

  it('walks a two-bar beat through its own two bars in order', () => {
    const song = songWith('b', 0, 4)
    const at = (bar: number) => voicingsAt(song, patterns, bar * STEPS_PER_MEASURE)[0].step
    expect([at(0), at(1), at(2), at(3)]).toEqual([0, STEPS_PER_MEASURE, 0, STEPS_PER_MEASURE])
  })

  it("starts a clip at the beat's own beginning wherever it was placed", () => {
    const song = songWith('b', 3, 2)
    expect(voicingsAt(song, patterns, 3 * STEPS_PER_MEASURE)[0].step).toBe(0)
  })

  it('layers every row that has a clip there', () => {
    let song = songWith('a', 0, 2)
    song = addClip(addRow(song, 'b'), 1, { start: 0, length: 2 })
    expect(voicingsAt(song, patterns, 0).map((v) => v.pattern.id)).toEqual(['a', 'b'])
  })

  it('passes the row level through as a gain on the drums', () => {
    const song = setRowLevel(songWith('a', 0, 1), 0, 0.5)
    expect(voicingsAt(song, patterns, 0)[0].gain).toBe(0.5)
  })

  // A beat's melody level was balanced against that beat's own drums, which is
  // the wrong question once it is one row among several. Two faders in series
  // would also mean the row's did not mean what it says.
  it('makes the row level the melody level outright, not a scale on it', () => {
    const song = setRowLevel(songWith('a', 0, 1), 0, 0.5)
    expect(voicingsAt(song, patterns, 0)[0].melodyLevel).toBe(0.5)
  })

  it('skips a muted row', () => {
    const song = toggleRowMute(songWith('a', 0, 1), 0)
    expect(voicingsAt(song, patterns, 0)).toEqual([])
  })

  it('skips a row turned all the way down', () => {
    const song = setRowLevel(songWith('a', 0, 1), 0, 0)
    expect(voicingsAt(song, patterns, 0)).toEqual([])
  })

  // A beat and a song are deleted independently, so this is expected rather
  // than exceptional: the row goes quiet, the rest of the song plays on.
  it('skips a row whose beat is gone, and keeps the others', () => {
    let song = songWith('a', 0, 2)
    song = addClip(addRow(song, 'deleted'), 1, { start: 0, length: 2 })
    expect(voicingsAt(song, patterns, 0).map((v) => v.pattern.id)).toEqual(['a'])
  })
})

describe('the song as an arrangement', () => {
  const patterns = library(beat('a'))

  it('takes its tempo from the song, not from the beats in it', () => {
    const song = setSongBpm(songWith('a', 0, 1), 96)
    expect(songArrangement(song, patterns).bpm).toBe(96)
    expect(patterns.get('a')!.bpm).not.toBe(96)
  })

  it('is as long as the song', () => {
    const song = songWith('a', 0, 1)
    expect(songArrangement(song, patterns).steps).toBe(song.bars * STEPS_PER_MEASURE)
  })
})


describe('setRowPattern', () => {
  it('points the row at another beat', () => {
    const song = addRow(createEmptySong(), 'boom')
    expect(setRowPattern(song, 0, 'clap').rows[0].patternId).toBe('clap')
  })

  // What a fork needs: the row goes on playing in exactly the bars it did.
  it('keeps the clips it was playing', () => {
    const song = addClip(addRow(createEmptySong(), 'boom'), 0, { start: 2, length: 3 })
    expect(setRowPattern(song, 0, 'clap').rows[0].clips).toEqual(song.rows[0].clips)
  })

  it('ignores a row that is not there', () => {
    const song = addRow(createEmptySong(), 'boom')
    expect(setRowPattern(song, 4, 'clap')).toEqual(song)
  })
})
