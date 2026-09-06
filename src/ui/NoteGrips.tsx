import { hasGrip, type NoteRole } from './noteEdits'

/**
 * The two handles that resize a note, drawn only on the outer ends of its run.
 *
 * They are real elements rather than a measured strip of the cell, so what can
 * be grabbed is exactly what is drawn. Everything they do not cover moves the
 * note, which is the only way a one- or two-step note can be moved at all --
 * neither has a middle.
 */
export function NoteGrips({ role }: { role: NoteRole | null }) {
  if (!role) return null

  return (
    <>
      {hasGrip(role, 'start') ? (
        <span className="note__grip note__grip--start" data-grip="start" aria-hidden="true" />
      ) : null}
      {hasGrip(role, 'end') ? (
        <span className="note__grip note__grip--end" data-grip="end" aria-hidden="true" />
      ) : null}
    </>
  )
}
