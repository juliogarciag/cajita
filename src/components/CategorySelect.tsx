import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'

interface CategorySelectProps {
  value: string | null
  onChange: (categoryId: string | null) => void
  autoFocus?: boolean
  onTab?: (shift: boolean) => void
  onEnter?: () => void
}

export function CategorySelect({
  value,
  onChange,
  autoFocus,
  onTab,
  onEnter,
}: CategorySelectProps) {
  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  // Show active categories + the currently selected one (even if archived)
  const visibleCategories = useMemo(
    () => categories.filter((cat) => !cat.archived || cat.id === value),
    [categories, value],
  )

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      autoFocus={autoFocus}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          onTab?.(e.shiftKey)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        }
      }}
    >
      <option value="">No category</option>
      {visibleCategories.map((cat: Category) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}
