import { useLiveQuery } from '@tanstack/react-db'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'

interface CategoryFilterProps {
  value: string | null
  onChange: (categoryId: string | null) => void
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      <option value="">All Categories</option>
      {categories.map((cat: Category) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}
