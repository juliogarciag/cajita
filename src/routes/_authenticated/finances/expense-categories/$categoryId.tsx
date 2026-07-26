import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const ExpenseCategoryDetailPage = lazy(() =>
  import('#/components/ExpenseCategoryDetail.js').then((m) => ({
    default: m.ExpenseCategoryDetail,
  })),
)

const searchSchema = z.object({
  // An expense_item_id used to scroll-and-flash a row (search palette navigation).
  highlightItem: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/finances/expense-categories/$categoryId')({
  component: ExpenseCategoryDetailRoute,
  validateSearch: searchSchema,
})

function ExpenseCategoryDetailRoute() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <ExpenseCategoryDetailPage />
    </Suspense>
  )
}
