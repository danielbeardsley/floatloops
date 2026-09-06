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
