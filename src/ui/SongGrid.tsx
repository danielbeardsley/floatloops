import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../state/libraryStore'
import { usePatternStore } from '../state/patternStore'
import { useSongStore } from '../state/songStore'
import { useSettingsStore } from '../state/settingsStore'
import { stop } from '../state/transport'
import {
  barHasClips,
  canAddBar,
  canAddRow,
  canRemoveBar,
  clipAt,
  clipRole,
  type SongRow,
} from '../state/song'
import { STEPS_PER_MEASURE } from '../audio/timing'
import { bridgesGap, clipFill, rowColor, type ClipFill } from './songCells'
import { useNoteEditor, type NoteTarget } from './useNoteEditor'
import type { NotePreview } from './noteEdits'
import { usePlayhead } from './usePlayhead'
import { useTwoFingerPan } from './useTwoFingerPan'
import { BeatPicker } from './BeatPicker'

/** Width of the sticky row column. Keep in step with --label-w in app.css. */
const LABEL_WIDTH = 240

/** Whether the next bar is where the beat starts over, so the gap stays open. */
function nextLoops(
  row: SongRow,
  rowIndex: number,
  patternBars: number,
  preview: NotePreview | null,
  bar: number,
): boolean {
  return clipFill(row, rowIndex, patternBars, preview, bar + 1)?.loops === true
}

/** What a screen reader gets, since the seams and stripes say nothing to it. */
function describeCell(name: string, bar: number, fill: ClipFill | null): string {
  const where = `${name} bar ${bar + 1}`
  if (!fill) return where
  if (fill.cut) return `${where}, cut short`
  if (fill.loops) return `${where}, starts again`
  return where
}

/**
 * The arrangement grid: one row per beat, one column per bar.
 *
 * It is the sequencer's grid with the axes reinterpreted, and it reuses the
 * piano roll's gesture layer wholesale -- a clip is drawn, resized from either
 * end, slid along and tapped away exactly like a note. The one difference is
 * that a clip cannot change rows, because a row *is* which beat plays.
 */
export function SongGrid() {
  const navigate = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const song = useSongStore((s) => s.song)
  const patternsById = useLibraryStore((s) => s.patternsById)
  const isPlaying = useSongStore((s) => s.isPlaying)
  const toggleRowMute = useSongStore((s) => s.toggleRowMute)
  const setRowLevel = useSongStore((s) => s.setRowLevel)
  const removeRow = useSongStore((s) => s.removeRow)
  const addBar = useSongStore((s) => s.addBar)
  const followPlayhead = useSettingsStore((s) => s.followPlayhead)
  const setFollowPlayhead = useSettingsStore((s) => s.setFollowPlayhead)

  const [picking, setPicking] = useState(false)
  const [preview, setPreview] = useState<NotePreview | null>(null)

  // Read through getState so these stay stable across edits.
  const clipUnder = useCallback(({ pitch: rowIndex, stepIndex: bar }: NoteTarget) => {
    const row = useSongStore.getState().song.rows[rowIndex]
    if (!row) return null

    const clip = clipAt(row, bar)
    if (!clip) return null

    return {
      id: clip.id,
      role: clipRole(clip, bar),
      shape: { pitch: rowIndex, start: clip.start, length: clip.length },
    }
  }, [])

  /** How many bars the beat on a row is. One for a row whose beat is gone. */
  const barsOfRow = useCallback((rowIndex: number) => {
    const row = useSongStore.getState().song.rows[rowIndex]
    if (!row) return 1
    return useLibraryStore.getState().patternsById.get(row.patternId)?.measures ?? 1
  }, [])

  const editor = useNoteEditor({
    container: scroller,
    lane: 'row',
    lockLane: true,
    // A press places the beat whole. Tapping a four-bar beat and getting one
    // bar of it was silent truncation with nothing on screen to explain it.
    minDraw: barsOfRow,
    noteUnder: clipUnder,
    totalSteps: () => useSongStore.getState().song.bars,
    onDraw: ({ pitch, start, length }) =>
      useSongStore.getState().addClip(pitch, { start, length }),
    onEdit: (id, { pitch, start, length }) =>
      useSongStore.getState().updateClip(pitch, id, { start, length }),
    onRemove: (id) => {
      const state = useSongStore.getState()
      const rowIndex = state.song.rows.findIndex((row) =>
        row.clips.some((clip) => clip.id === id),
      )
      if (rowIndex >= 0) state.removeClip(rowIndex, id)
    },
    onPreviewChange: (next) => {
      dragging.current = next !== null
      setPreview(next)
    },
  })

  const pan = useTwoFingerPan({
    container: scroller,
    onStart: () => {
      // Reaching for a scroll must not leave a block behind.
      editor.abort()
      dragging.current = true
    },
    onEnd: () => {
      dragging.current = false
    },
  })

  const gestures = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      editor.onPointerDown(e)
      pan.onPointerDown(e)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      editor.onPointerMove(e)
      pan.onPointerMove(e)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      editor.onPointerUp(e)
      pan.onPointerUp(e)
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      editor.onPointerCancel(e)
      pan.onPointerCancel(e)
    },
  }

  const scrollToBar = useCallback((bar: number, onlyIfHidden: boolean) => {
    const root = scroller.current
    const marker = root?.querySelector<HTMLElement>(`[data-measure="${bar}"]`)
    if (!root || !marker) return

    const frame = root.getBoundingClientRect()
    const cell = marker.getBoundingClientRect()

    // Unlike the beat grid, several bars fit on screen at once, so following
    // only scrolls when the playhead has actually left the view. Nudging the
    // grid every bar would be constant, pointless motion.
    if (onlyIfHidden && cell.left >= frame.left + LABEL_WIDTH && cell.right <= frame.right) return

    root.scrollTo({ left: root.scrollLeft + (cell.left - frame.left) - LABEL_WIDTH, behavior: 'smooth' })
  }, [])

  usePlayhead(scroller, isPlaying, {
    columnOf: (step) => Math.floor(step / STEPS_PER_MEASURE),
    onStep: (step) => {
      if (step === null || dragging.current) return
      if (!useSettingsStore.getState().followPlayhead) return
      scrollToBar(Math.floor(step / STEPS_PER_MEASURE), true)
    },
  })

  const onRemoveBar = useCallback((bar: number) => {
    const store = useSongStore.getState()
    if (
      barHasClips(store.song, bar) &&
      !window.confirm(`Remove bar ${bar + 1}? Anything in it will be lost.`)
    ) {
      return
    }
    store.removeBar(bar)
  }, [])

  const onEditBeat = useCallback(
    (patternId: string) => {
      const pattern = useLibraryStore.getState().patternsById.get(patternId)
      if (!pattern) return
      stop()
      usePatternStore.getState().setPattern(pattern)
      void navigate('/')
    },
    [navigate],
  )

  const columns = Array.from({ length: song.bars }, (_, i) => i)

  return (
    <>
      <div
        className="grid grid--song"
        ref={scroller}
        data-testid="song-grid"
        {...gestures}
      >
        <div className="grid__content" style={{ ['--steps' as string]: song.bars }}>
          <div className="grid__corner">
            <button
              type="button"
              className={`follow${followPlayhead ? ' follow--on' : ''}`}
              onClick={() => setFollowPlayhead(!followPlayhead)}
              aria-pressed={followPlayhead}
              title="Scroll the song to keep up with the playhead"
            >
              Follow
            </button>
          </div>

          {columns.map((bar) => (
            <div key={bar} className="ruler__measure ruler__measure--bar" data-measure={bar}>
              <button
                type="button"
                className="ruler__jump"
                onClick={() => scrollToBar(bar, false)}
                aria-label={`Go to bar ${bar + 1}`}
              >
                {bar + 1}
              </button>
              {canRemoveBar(song) ? (
                <button
                  type="button"
                  className="ruler__remove"
                  onClick={() => onRemoveBar(bar)}
                  aria-label={`Remove bar ${bar + 1}`}
                  title={`Remove bar ${bar + 1}`}
                >
                  &times;
                </button>
              ) : null}
            </div>
          ))}

          {song.rows.map((row, rowIndex) => {
            const pattern = patternsById.get(row.patternId)
            const name = pattern?.name ?? 'Missing beat'
            const bars = pattern?.measures ?? 1
            const color = rowColor(rowIndex)

            return [
              <div
                key={`${row.id}-label`}
                className={[
                  'row__label',
                  'row__label--song',
                  row.muted ? 'row__label--muted' : '',
                  pattern ? '' : 'row__label--missing',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--track-color' as string]: color }}
              >
                <span className="row__top">
                  <span className="row__name" title={name}>
                    {name}
                  </span>
                  {/* How long the beat itself is, which is what decides where
                      a block loops. Without it the seams have no explanation. */}
                  {pattern ? (
                    <span className="row__bars">
                      {bars} {bars === 1 ? 'bar' : 'bars'}
                    </span>
                  ) : null}
                </span>
                <span className="row__controls">
                  <button
                    type="button"
                    className="row__mute"
                    onClick={() => toggleRowMute(rowIndex)}
                    aria-pressed={row.muted}
                    aria-label={`${row.muted ? 'Unmute' : 'Mute'} ${name}`}
                  >
                    M
                  </button>
                  <input
                    type="range"
                    className="row__level"
                    min={0}
                    max={1}
                    step={0.05}
                    value={row.level}
                    onChange={(e) => setRowLevel(rowIndex, Number(e.target.value))}
                    aria-label={`${name} volume`}
                  />
                  <button
                    type="button"
                    className="row__action"
                    onClick={() => onEditBeat(row.patternId)}
                    disabled={!pattern}
                    aria-label={`Edit ${name}`}
                    title="Open this beat in the sequencer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="row__action row__action--remove"
                    onClick={() => removeRow(rowIndex)}
                    aria-label={`Remove ${name} from the song`}
                    title="Remove this row"
                  >
                    &times;
                  </button>
                </span>
              </div>,
              ...columns.map((bar) => {
                const fill = clipFill(row, rowIndex, bars, preview, bar)
                const classes = [
                  'cell',
                  'clip',
                  fill ? `note--${fill.role}` : '',
                  fill ? 'clip--on' : '',
                  fill?.draft ? 'note--draft' : '',
                  fill?.cut ? 'clip--cut' : '',
                  // The gap is bridged inside a pass and left open where the
                  // beat starts again, so the repeats read as repeats.
                  bridgesGap(fill) && !nextLoops(row, rowIndex, bars, preview, bar)
                    ? 'note--bridge'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    key={`${row.id}-${bar}`}
                    type="button"
                    className={classes}
                    data-row={rowIndex}
                    data-step={bar}
                    style={{ ['--note-color' as string]: color }}
                    aria-label={describeCell(name, bar, fill)}
                    aria-pressed={fill !== null}
                    title={fill?.cut ? `${name} is cut short here` : undefined}
                  >
                    {/* The beat's own name is unreadable at this size, so the
                        first cell says how many times it plays instead. */}
                    {fill && fill.passes > 1 && (fill.role === 'start' || fill.role === 'single') ? (
                      <span className="clip__bars" aria-hidden="true">
                        &times;{fill.passes}
                      </span>
                    ) : null}
                  </button>
                )
              }),
            ]
          })}

          <div className="song-add">
            <div className="song-add__inner">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setPicking(true)}
                disabled={!canAddRow(song)}
              >
                + Add a beat
              </button>
              {canAddRow(song) ? null : (
                <span className="song-add__note">That is as many beats as a song can hold.</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="grid__add"
          onClick={addBar}
          disabled={!canAddBar(song)}
          aria-label="Add a bar"
          title="Add a bar"
        >
          +
        </button>
      </div>

      {picking ? <BeatPicker onClose={() => setPicking(false)} /> : null}
    </>
  )
}
