import { useEffect } from 'react'
import { stop } from '../state/transport'

/**
 * Stops the transport when the screen goes away.
 *
 * The audio *engine* still outlives the router -- tearing the AudioContext
 * down on navigation would cost another unlock gesture, and that rule has not
 * changed. What does not outlive it is the transport: a beat still playing
 * from a screen you have left is a sound with no visible source, no playhead,
 * and no obvious way to stop it short of finding your way back.
 *
 * Safe under StrictMode's mount/unmount/mount: the extra stop lands before
 * anything has been started.
 */
export function useStopOnLeave(): void {
  useEffect(() => () => stop(), [])
}
