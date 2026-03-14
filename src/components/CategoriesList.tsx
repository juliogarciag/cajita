import { useState, useCallback, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { createCategory, updateCategory, deleteCategory, archiveCategory } from '#/server/categories.js'
import { budgetColors } from '#/lib/budget-colors.js'
import { ConfirmButton } from './ConfirmButton.js'

export function CategoriesList() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(budgetColors[0].value)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  const archivedCount = useMemo(
    () => categories.filter((c) => c.archived).length,
    [categories],
  )

  const visibleCategories = useMemo(
    () => (showArchived ? categories : categories.filter((c) => !c.archived)),
    [categories, showArchived],
  )

  const handleAdd = useCallback(async () => {
    if (!addName.trim()) return
    try {
      await createCategory({ data: { name: addName.trim(), color: addColor } })
      setShowAddForm(false)
      setAddName('')
      setAddColor(budgetColors[0].value)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category')
    }
  }, [addName, addColor])

  const handleStartEdit = useCallback((cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.color)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) return
    try {
      await updateCategory({ data: { id: editingId, name: editName.trim(), color: editColor } })
      setEditingId(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }, [editingId, editName, editColor])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteCategory({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }, [])

  const handleArchive = useCallback(async (id: string, archived: boolean) => {
    try {
      await archiveCategory({ data: { id, archived } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive category')
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">New Category</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Name</label>
                <input
                  type="text"
                  placeholder="Category name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  autoFocus
                  className="w-48 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!addName.trim()}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Color</label>
              <div className="flex gap-1.5">
                {budgetColors.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => setAddColor(c.value)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${addColor === c.value ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        {archivedCount > 0 && (
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show archived ({archivedCount})
            </label>
          </div>
        )}

        {visibleCategories.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No categories yet. Create your first one.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleCategories.map((cat: Category) => {
              const isBudgetOwned = !!cat.budget_id
              const isEditing = editingId === cat.id

              return (
                <div key={cat.id} className={`flex items-center gap-3 px-4 py-3 ${cat.archived ? 'opacity-50' : ''}`}>
                  {isEditing ? (
                    <>
                      <div className="flex gap-1.5">
                        {budgetColors.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setEditColor(c.value)}
                            className={`h-5 w-5 rounded-full border-2 transition-transform ${editColor === c.value ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900">{cat.name}</span>
                      {isBudgetOwned ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                          Budget
                        </span>
                      ) : cat.archived ? (
                        <button
                          onClick={() => handleArchive(cat.id, false)}
                          className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleArchive(cat.id, true)}
                            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            Archive
                          </button>
                          <ConfirmButton
                            onConfirm={() => handleDelete(cat.id)}
                            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            ×
                          </ConfirmButton>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
