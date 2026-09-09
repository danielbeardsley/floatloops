import '@testing-library/jest-dom/vitest'

/**
 * jsdom has no PointerEvent, and Testing Library falls back to a plain Event
 * when the constructor is missing -- which silently drops `pointerId` and the
 * coordinates. Every gesture in this app is built on those, so without this
 * a test can fire two fingers and the code under test sees one.
 *
 * Only what the app actually reads is filled in. Pointer capture is left off
 * entirely, as it is in real jsdom; the gesture code already optional-chains
 * it for exactly that reason.
 */
const globalWindow = typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>)

if (globalWindow && !('PointerEvent' in globalWindow)) {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'touch'
      this.isPrimary = init.isPrimary ?? true
    }
  }

  globalWindow.PointerEvent = TestPointerEvent
}

/**
 * jsdom implements no scrolling at all, so an element has no `scrollTo` -- and
 * the grids call it to follow the playhead and to land on the bar a beat was
 * being edited at. Without a stand-in those paths throw in tests and pass in a
 * browser, which is the worst way round. It does nothing, which is exactly
 * what scrolling does in a document with no layout.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {}
}
