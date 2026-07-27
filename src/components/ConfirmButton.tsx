import { useState, useCallback, type ReactNode } from 'react'
import { useClickAwayDismiss } from '#/lib/use-click-away-dismiss.js'

interface ConfirmButtonProps {
  onConfirm: () => void
  children: ReactNode
  className?: string
  confirmClassName?: string
  confirming?: boolean
  onConfirmingChange?: (confirming: boolean) => void
  tabIndex?: number
  /** Names the action — icon-only buttons have no accessible name without it. */
  title?: string
}

export function ConfirmButton({
  onConfirm,
  children,
  className = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600',
  confirmClassName = 'rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50',
  confirming: externalConfirming,
  onConfirmingChange,
  tabIndex,
  title,
}: ConfirmButtonProps) {
  const [internalConfirming, setInternalConfirming] = useState(false)
  const confirming = externalConfirming ?? internalConfirming
  const setConfirming = onConfirmingChange ?? setInternalConfirming

  useClickAwayDismiss(
    confirming,
    useCallback(() => setConfirming(false), [setConfirming]),
  )

  if (confirming) {
    return (
      <button
        data-confirm-delete
        tabIndex={tabIndex}
        onClick={() => {
          onConfirm()
          setConfirming(false)
        }}
        className={confirmClassName}
      >
        Sure?
      </button>
    )
  }

  return (
    <button
      tabIndex={tabIndex}
      title={title}
      aria-label={title}
      onClick={() => setConfirming(true)}
      className={className}
    >
      {children}
    </button>
  )
}
