import { useEffect, type RefObject } from 'react'
import { getSequencer } from '../state/transport'

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
  className = 'is-playing',
): void {
  useEffect(() => {
    const root = container.current
    if (!root) return

    let frame = 0
    let litStep: number | null = null
    let lit: Element[] = []

    const clear = () => {
      for (const el of lit) el.classList.remove(className)
      lit = []
      litStep = null
    }

    const loop = () => {
      const step = isPlaying ? getSequencer().currentStep() : null

      if (step !== litStep) {
        clear()
        if (step !== null) {
          lit = Array.from(root.querySelectorAll(`[data-step="${step}"]`))
          for (const el of lit) el.classList.add(className)
          litStep = step
        }
      }

      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      clear()
    }
  }, [container, isPlaying, className])
}
