import { useState, useRef, useEffect, useCallback } from 'react'
import { formatCents, parseDollarsTocents } from '#/lib/format.js'

interface CheckpointPopoverProps {
  expectedCents: number
  onConfirm: (actualCents: number) => void
  onClose: () => void
}

export function CheckpointPopover({ expectedCents, onConfirm, onClose }: CheckpointPopoverProps) {
  const [actualInput, setActualInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const actualCents = parseDollarsTocents(actualInput)
  const diffCents = actualCents !== null ? actualCents - expectedCents : null

  const handleConfirm = useCallback(() => {
    if (actualCents === null) return
    onConfirm(actualCents)
  }, [actualCents, onConfirm])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      }
    },
    [handleConfirm],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div
        ref={panelRef}
        className="w-[320px] rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
      >
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Balance checkpoint</h3>

        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-gray-500">Expected total</span>
          <span className="font-medium">{formatCents(expectedCents)}</span>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-500">Actual balance</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value.replace(/[^0-9.\-]/g, ''))}
            onKeyDown={(e) => {
              const allowed = /^[0-9.\-]$/
              if (
                !allowed.test(e.key) &&
                !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape', 'Enter', 'Home', 'End'].includes(e.key) &&
                !e.metaKey &&
                !e.ctrlKey
              ) {
                e.preventDefault()
                return
              }
              handleKeyDown(e)
            }}
            placeholder="0.00"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        {diffCents !== null && (
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">Difference</span>
            <span className={`font-medium ${diffCents === 0 ? 'text-green-600' : diffCents > 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCents(diffCents)}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={actualCents === null}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Checkpoint
          </button>
        </div>
      </div>
    </div>
  )
}
