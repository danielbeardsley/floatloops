import { GHOST_MUTED, GHOST_NONE } from './ghostMarks'
import type { NoteRole } from './noteEdits'

/**
 * What another beat is playing on this step, drawn through the cell.
 *
 * A real element rather than a pseudo-element, for the same reason the note
 * handles are: the cells already spend their `::after` on bridging the grid
 * gap, and an outline that has to reach across that gap needs to be a thing in
 * its own right. It takes no pointers, so a step can be drawn straight through
 * a ghost without the ghost ever being what the finger meant.
 */
export function GhostMark({ level, role }: { level: number; role: NoteRole | null }) {
  if (level === GHOST_NONE || !role) return null

  const classes = ['ghost', `ghost--${role}`, level === GHOST_MUTED ? 'ghost--muted' : '']
    .filter(Boolean)
    .join(' ')

  return <span className={classes} aria-hidden="true" />
}
