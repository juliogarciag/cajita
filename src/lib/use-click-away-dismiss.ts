import { useEffect } from 'react'

/**
 * Dismisses a confirmation state when clicking outside a `[data-confirm-delete]` element.
 * Used for delete confirmation buttons that should close on click-away.
 */
export function useClickAwayDismiss(isActive: boolean, dismiss: () => void) {
  useEffect(() => {
    if (!isActive) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-confirm-delete]')) {
        dismiss()
      }
    }
    document.addEventListener('click', handler, { capture: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [isActive, dismiss])
}
