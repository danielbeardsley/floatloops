import type { Point } from './useTwoFingerPan'

/**
 * On a phone, a finger on the grid scrolls it, and a tap edits it.
 *
 * The tablet's bargain is the other way round: a finger on a cell paints a run
 * of steps, and scrolling takes two fingers or a grab at the chrome around the
 * grid. That is a good trade when the chrome is a small part of the screen and
 * a drag crosses half a bar before it runs out of room.
 *
 * A phone has neither. The track column is a quarter of the width, a drag
 * spans a few steps, and the grid is a dozen screens wide. So the drag is
 * worth much less there and the scroll it costs is worth much more -- and the
 * cells hand the drag back to the browser, which has scrolling, flicks and
 * inertia already built. What is left for the grid is the tap.
 *
 * Which is the whole of it for the drums, where a step is on or off. The
 * piano roll keeps one exception: a note's grips still drag, because dragging
 * is how a note gets longer and there is no tap that means the same thing.
 * A grip is a small target at an edge, so landing on one is a deliberate grab
 * rather than a scroll gone wrong.
 *
 * Touch only, and only on a phone. A mouse cannot scroll by dragging, so it
 * has nothing to give back and goes on painting at any window size.
 */

/** Keep in step with the phone's @media block in app.css. */
export const PHONE_WIDTH = 640

/**
 * How far a finger may wander and still have meant the cell it came down on.
 * Generous: it is aimed at a child holding a phone one-handed, and anything
 * beyond it is a scroll that the browser is already running.
 */
export const TAP_SLOP = 12

export function fingerScrolls(event: { pointerType: string }): boolean {
  if (event.pointerType !== 'touch') return false
  return window.matchMedia?.(`(max-width: ${PHONE_WIDTH}px)`).matches ?? false
}

/** Whether a finger has gone far enough to have meant a scroll. */
export function movedOff(from: Point, to: Point): boolean {
  return Math.abs(to.x - from.x) > TAP_SLOP || Math.abs(to.y - from.y) > TAP_SLOP
}
