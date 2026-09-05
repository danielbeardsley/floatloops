import { useRef } from 'react'
import { usePatternStore } from '../state/patternStore'
import { totalSteps } from '../state/schema'
import { STEPS_PER_BEAT, STEPS_PER_MEASURE } from '../audio/timing'
import { usePlayhead } from './usePlayhead'

/**
 * Phase 2 stand-in for the sequencer grid: one row of steps, lit by the
 * playhead. It exists to prove the scheduler loops in time and that the
 * playhead follows the audio clock. Phase 3 replaces it with the real grid,
 * which reuses the same data-step convention.
 */
export function StepStrip() {
  const container = useRef<HTMLDivElement>(null)
  const pattern = usePatternStore((s) => s.pattern)
  const isPlaying = usePatternStore((s) => s.isPlaying)

  usePlayhead(container, isPlaying)

  const steps = Array.from({ length: totalSteps(pattern) }, (_, i) => i)

  return (
    <div className="strip" ref={container} data-testid="step-strip">
      {steps.map((step) => (
        <span
          key={step}
          data-step={step}
          className={`strip__step${step % STEPS_PER_BEAT === 0 ? ' strip__step--beat' : ''}${
            step % STEPS_PER_MEASURE === 0 ? ' strip__step--bar' : ''
          }`}
        />
      ))}
    </div>
  )
}
