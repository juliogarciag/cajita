import { toast } from 'sonner'
import { updateExpenseCategory } from '#/server/expense-categories.js'

/**
 * Pinning is offered from the category list and from a category's own page, so
 * the call and its wording live here rather than being written twice.
 */
export async function setCategoryPinned(id: string, pinned: boolean): Promise<void> {
  try {
    await updateExpenseCategory({ data: { id, pinned } })
    toast.success(pinned ? 'Pinned to dashboard' : 'Removed from dashboard')
  } catch {
    toast.error(pinned ? "Couldn't pin the category" : "Couldn't unpin the category")
  }
}
