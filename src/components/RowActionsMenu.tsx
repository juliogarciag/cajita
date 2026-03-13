import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'

interface RowActionsMenuProps {
  onReconcile: () => void
  onDelete?: () => void
}

export function RowActionsMenu({ onReconcile, onDelete }: RowActionsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-md"
        >
          <DropdownMenu.Item
            onSelect={onReconcile}
            className="cursor-pointer px-3 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-50"
          >
            Reconcile
          </DropdownMenu.Item>

          {onDelete && (
            <DropdownMenu.Item
              onSelect={onDelete}
              className="cursor-pointer px-3 py-1.5 text-sm text-red-600 outline-none hover:bg-red-50"
            >
              Delete
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
