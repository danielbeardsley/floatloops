import { useEffect, useRef, type RefObject } from 'react'
import { getSequencer } from '../state/transport'

export type PlayheadOptions = {
  className?: string
  /** Called when the playhead lands on a new step, or null when it stops. */
  onStep?: (step: number | null) => void
  /**
   * Which column a step lights up. The beat grid is one column per step; the
   * song grid is one column per bar, so it maps sixteen steps onto one. Cells
   * only change class when the column does, which is what keeps the song
   * playhead from touching the DOM sixteen times as often as it needs to.
   */
  columnOf?: (step: number) => number
}

/**
 * Moves a highlight class along elements tagged with data-step, driven by an
 * animation frame loop that reads the audio clock.
 *
 * Deliberately not React state: at four measures the grid holds 512 cells, and
 * re-rendering them eight times a second would drop frames on a tablet. The
 * loop touches only the elements whose class actually changes.
 */
export function usePlayhead(
  container: RefObject<HTMLElement | null>,
  isPlaying: boolean,
  options: PlayheadOptions = {},
): void {
  const { className = 'is-playing', columnOf } = options

  // Held in a ref so a caller's inline callback cannot restart the loop.
  const onStep = useRef(options.onStep)
  onStep.current = options.onStep

  // Also held in a ref: a caller's inline arrow must not restart the loop.
  const toColumn = useRef(columnOf)
  toColumn.current = columnOf

  useEffect(() => {
    const root = container.current
    if (!root) return

    let frame = 0
    let litStep: number | null = null
    let litColumn: number | null = null
    let lit: Element[] = []

    const clear = () => {
      for (const el of lit) el.classList.remove(className)
      lit = []
    }

    const loop = () => {
      const step = isPlaying ? getSequencer().currentStep() : null

      if (step !== litStep) {
        const column = step === null ? null : (toColumn.current?.(step) ?? step)

        if (column !== litColumn) {
          clear()
          if (column !== null) {
            lit = Array.from(root.querySelectorAll(`[data-step="${column}"]`))
            for (const el of lit) el.classList.add(className)
          }
          litColumn = column
        }

        litStep = step
        onStep.current?.(step)
      }

      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      clear()
      litColumn = null
    }
  }, [container, isPlaying, className])
}
