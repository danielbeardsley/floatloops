/**
 * iOS Safari's own flag for a page opened from the Home Screen. Only Apple
 * defines it, which is what makes it useful: undefined means not iOS at all.
 */
interface Navigator {
  standalone?: boolean
}
