import { useLiveQuery } from '@tanstack/react-db'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'

interface CategorySelectProps {
  value: string | null
  onChange: (categoryId: string | null) => void
  autoFocus?: boolean
}

export function CategorySelect({ value, onChange, autoFocus }: CategorySelectProps) {
  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      autoFocus={autoFocus}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
    >
      <option value="">No category</option>
      {categories.map((cat: Category) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}
