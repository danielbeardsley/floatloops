/**
 * The columns a row is not drawing, as one empty element wide enough to hold
 * their place.
 *
 * The grid's columns are sized by its template rather than by what is in
 * them, so this needs no width of its own: it only has to occupy the tracks,
 * which keeps every cell after it in the column it belongs to and keeps the
 * beat as wide as it really is.
 */
export function GridGap({ span }: { span: number }) {
  if (span <= 0) return null
  return <div style={{ gridColumn: `span ${span}` }} aria-hidden="true" />
}
