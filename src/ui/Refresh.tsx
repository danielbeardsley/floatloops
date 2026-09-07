import { confirmRefresh } from './unsaved'

/**
 * Reloads the app.
 *
 * FloatLoops is meant to run on a kiosk: no address bar to reload from, no
 * keyboard to press F5 on, and nobody around who would think to. This is the
 * way out of an app that has got itself stuck, which is why it is a blunt
 * browser reload rather than anything cleverer -- anything cleverer is one
 * more thing that can be stuck.
 *
 * Blunt is also why it asks first. A reload is the one button here that can
 * throw away a morning's work without the work having gone anywhere.
 */
export function RefreshButton() {
  return (
    <button
      type="button"
      className="app__refresh"
      onClick={() => {
        if (confirmRefresh()) window.location.reload()
      }}
    >
      <span className="app__refresh-glyph" aria-hidden="true">
        ↻
      </span>
      Refresh
    </button>
  )
}
