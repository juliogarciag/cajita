import { type ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

interface ConfirmButtonProps {
  onConfirm: () => void
  /** Trigger content — usually an icon. */
  children: ReactNode
  /** Question the dialog asks; also names the trigger for screen readers. */
  title: string
  /** What actually happens, so the answer isn't a guess. */
  description?: ReactNode
  /** Label on the confirming button. Say the verb, not "OK". */
  confirmLabel?: string
  /** Destructive actions get a red button; reversible ones stay neutral. */
  tone?: 'danger' | 'neutral'
  className?: string
  tabIndex?: number
}

const toneClasses = {
  danger: 'bg-red-600 hover:bg-red-700',
  neutral: 'bg-gray-900 hover:bg-gray-800',
} as const

/**
 * Asks before doing something irreversible. A dialog rather than an inline
 * "Sure?" so there's room to say what will be lost, and so the confirming
 * button is never where the trigger just was.
 */
export function ConfirmButton({
  onConfirm,
  children,
  title,
  description,
  confirmLabel = 'Delete',
  tone = 'danger',
  className = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600',
  tabIndex,
}: ConfirmButtonProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button
          type="button"
          tabIndex={tabIndex}
          title={title}
          aria-label={title}
          className={className}
        >
          {children}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl ring-1 ring-black/5 focus:outline-none">
          <AlertDialog.Title className="text-base font-semibold text-gray-900">
            {title}
          </AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-1.5 text-sm text-gray-600">
              {description}
            </AlertDialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${toneClasses[tone]}`}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
