import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const ExpenseCategoryList = lazy(() =>
  import('#/components/ExpenseCategoryList.js').then((m) => ({ default: m.ExpenseCategoryList })),
)

const searchSchema = z.object({
  // Year the totals are scoped to. Absent = current year.
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const Route = createFileRoute('/_authenticated/finances/expense-categories/')({
  component: ExpenseCategoriesPage,
  validateSearch: searchSchema,
})

function ExpenseCategoriesPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <ExpenseCategoryList />
    </Suspense>
  )
}
