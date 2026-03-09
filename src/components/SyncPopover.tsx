import { useState } from 'react'
import { toISODate } from '#/lib/format.js'

interface SyncPopoverProps {
  onConfirm: (accountingDate: string) => void
  onClose: () => void
}

export function SyncPopover({ onConfirm, onClose }: SyncPopoverProps) {
  const [accountingDate, setAccountingDate] = useState(toISODate(new Date()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Sync to Accounting</h3>
        <p className="mb-3 text-xs text-gray-500">
          Choose the accounting date for this movement in the main table.
        </p>
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs text-gray-500">Accounting Date</label>
          <input
            type="date"
            value={accountingDate}
            onChange={(e) => setAccountingDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(accountingDate)}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sync
          </button>
        </div>
      </div>
    </div>
  )
}
