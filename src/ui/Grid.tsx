import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { usePatternStore } from '../state/patternStore'
import {
  canAddMeasure,
  canRemoveMeasure,
  isStepOn,
  measureHasHits,
  noteAt,
  noteRole,
  totalSteps,
} from '../state/schema'
import { secondsPerStep } from '../audio/timing'
import { audition, auditionNote } from '../audio/audition'
import { DrumRows } from './DrumRows'
import { MelodyRows } from './MelodyRows'
import { useNoteEditor, type NoteTarget } from './useNoteEditor'
import type { NotePreview, NoteShape } from './noteEdits'
import { useSettingsStore } from '../state/settingsStore'
import { planFollow } from './followPlayhead'
import { usePlayhead } from './usePlayhead'
import { useStepPainter, type StepTarget } from './useStepPainter'
import { useTwoFingerPan } from './useTwoFingerPan'

/** Width of the sticky track column. Keep in step with --label-w in app.css. */
const LABEL_WIDTH = 150

export function Grid() {
  const scroller = useRef<HTMLDivElement>(null)
  const painting = useRef(false)
  const shownMeasure = useRef<number | null>(null)

  const pattern = usePatternStore((s) => s.pattern)
  const isPlaying = usePatternStore((s) => s.isPlaying)
  const addMeasure = usePatternStore((s) => s.addMeasure)
  const followPlayhead = useSettingsStore((s) => s.followPlayhead)
  const setFollowPlayhead = useSettingsStore((s) => s.setFollowPlayhead)

  const steps = totalSteps(pattern)

  // Reading through getState keeps these callbacks stable, so the painter is
  // not rebuilt on every edit.
  const isOn = useCallback(({ trackIndex, stepIndex }: StepTarget) => {
    const track = usePatternStore.getState().pattern.tracks[trackIndex]
    return track ? isStepOn(track, stepIndex) : false
  }, [])

  const onPaint = useCallback((target: StepTarget, value: number) => {
    const store = usePatternStore.getState()
    const track = store.pattern.tracks[target.trackIndex]
    if (!track) return

    store.setStep(target.trackIndex, target.stepIndex, value)

    // Hearing the drum as you draw it is how you learn which row is which --
    // but not while the sequencer runs, where the step is about to sound in
    // its own place and doubling it only muddles the beat.
    if (value > 0 && !track.muted && !store.isPlaying) {
      void audition(track.voiceId, track.level)
    }
  }, [])

  // The preview changes only when the drag crosses a cell, a few times a second
  // at most, so React state is the right home for it -- unlike the playhead,
  // which moves every frame.
  const [preview, setPreview] = useState<NotePreview | null>(null)

  const noteUnder = useCallback(({ pitch, stepIndex }: NoteTarget) => {
    const melody = usePatternStore.getState().pattern.melody
    const note = noteAt(melody, pitch, stepIndex)
    if (!note) return null

    return {
      id: note.id,
      role: noteRole(note, stepIndex),
      shape: { pitch: note.pitch, start: note.start, length: note.length },
    }
  }, [])

  const hearNote = useCallback((shape: NoteShape) => {
    const store = usePatternStore.getState()

    // While the sequencer is running the note will sound in its own place a
    // moment later; auditioning on top of that just muddles the beat.
    if (store.isPlaying) return

    const { bpm, melody } = store.pattern
    if (melody.muted) return

    // Always a single step, however long the note is. The point is to hear
    // which pitch it is, not to sit through a held note before drawing the
    // next one.
    void auditionNote(melody.voiceId, shape.pitch, secondsPerStep(bpm), melody.level)
  }, [])

  const editor = useNoteEditor({
    container: scroller,
    noteUnder,
    totalSteps: () => totalSteps(usePatternStore.getState().pattern),
    onDraw: (shape) => {
      usePatternStore.getState().addNote(shape)
      hearNote(shape)
    },
    onEdit: (id, shape) => {
      usePatternStore.getState().updateNote(id, shape)
      hearNote(shape)
    },
    onRemove: (id) => usePatternStore.getState().removeNote(id),
    onPreviewChange: (next) => {
      // Editing a note suspends playhead following, exactly as painting does.
      painting.current = next !== null
      setPreview(next)
    },
  })

  // Undoing a stroke must not sound the drums it restores, which is the whole
  // reason this is not just onPaint.
  const onRevert = useCallback((target: StepTarget, value: number) => {
    usePatternStore.getState().setStep(target.trackIndex, target.stepIndex, value)
  }, [])

  const painter = useStepPainter({
    container: scroller,
    isOn,
    onPaint,
    onRevert,
    onPaintStart: () => {
      painting.current = true
    },
    onPaintEnd: () => {
      painting.current = false
    },
  })

  const pan = useTwoFingerPan({
    container: scroller,
    onStart: () => {
      // Reaching for a scroll must not leave a step or a note behind.
      painter.abort()
      editor.abort()
      painting.current = true
    },
    onEnd: () => {
      painting.current = false
    },
  })

  /**
   * One set of handlers for both halves of the grid. Each gesture ignores
   * events that did not start on a cell it owns, so they can safely both see
   * every event -- and pointer capture demands a single element anyway.
   */
  // The pan goes last on the way down, so that the second finger's own paint
  // is already in the stroke it then undoes.
  const gestures = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      painter.onPointerDown(event)
      editor.onPointerDown(event)
      pan.onPointerDown(event)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      painter.onPointerMove(event)
      editor.onPointerMove(event)
      pan.onPointerMove(event)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      painter.onPointerUp(event)
      editor.onPointerUp(event)
      pan.onPointerUp(event)
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      painter.onPointerCancel(event)
      editor.onPointerCancel(event)
      pan.onPointerCancel(event)
    },
  }

  const scrollToMeasure = useCallback((measure: number) => {
    const root = scroller.current
    const marker = root?.querySelector<HTMLElement>(`[data-measure="${measure}"]`)
    if (!root || !marker) return

    const offset = marker.getBoundingClientRect().left - root.getBoundingClientRect().left
    root.scrollTo({ left: root.scrollLeft + offset - LABEL_WIDTH, behavior: 'smooth' })
  }, [])

  usePlayhead(scroller, isPlaying, {
    onStep: (step) => {
      // Read through getState so toggling the preference does not re-render
      // the whole grid.
      const plan = planFollow(
        { step, painting: painting.current, follow: useSettingsStore.getState().followPlayhead },
        shownMeasure.current,
      )

      shownMeasure.current = plan.shownMeasure
      if (plan.scrollTo !== null) scrollToMeasure(plan.scrollTo)
    },
  })

  const onRemoveMeasure = useCallback((measureIndex: number) => {
    const store = usePatternStore.getState()
    // Only ask when there is something to lose.
    if (
      measureHasHits(store.pattern, measureIndex) &&
      !window.confirm(`Remove measure ${measureIndex + 1}? Anything in it will be lost.`)
    ) {
      return
    }

    store.removeMeasure(measureIndex)
    // The measure under the playhead has moved; let it re-follow.
    shownMeasure.current = null
  }, [])

  const measures = Array.from({ length: pattern.measures }, (_, i) => i)

  return (
    // The paint handlers sit on the same element that takes pointer capture:
    // once captured, events stop reaching descendants, so handlers on an inner
    // node would never fire again after the gesture started.
    <div className="grid" ref={scroller} data-testid="grid" {...gestures}>
      <div className="grid__content" style={{ ['--steps' as string]: steps }}>
        <div className="grid__corner">
          <button
            type="button"
            className={`follow${followPlayhead ? ' follow--on' : ''}`}
            onClick={() => setFollowPlayhead(!followPlayhead)}
            aria-pressed={followPlayhead}
            title="Scroll the grid to keep up with the beat"
          >
            Follow
          </button>
        </div>
        {measures.map((measure) => (
          <div key={measure} className="ruler__measure" data-measure={measure}>
            <button
              type="button"
              className="ruler__jump"
              onClick={() => scrollToMeasure(measure)}
              aria-label={`Go to measure ${measure + 1}`}
            >
              {measure + 1}
            </button>
            {canRemoveMeasure(pattern) ? (
              <button
                type="button"
                className="ruler__remove"
                onClick={() => onRemoveMeasure(measure)}
                aria-label={`Remove measure ${measure + 1}`}
                title={`Remove measure ${measure + 1}`}
              >
                &times;
              </button>
            ) : null}
          </div>
        ))}

        <DrumRows steps={steps} />

        <MelodyRows steps={steps} preview={preview} />
      </div>

      <button
        type="button"
        className="grid__add"
        onClick={addMeasure}
        disabled={!canAddMeasure(pattern)}
        aria-label="Add a measure"
        title="Add a measure"
      >
        +
      </button>
    </div>
  )
}
