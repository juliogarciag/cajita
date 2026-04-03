import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const BudgetDetailPage = lazy(() =>
  import('#/components/BudgetDetail.js').then((m) => ({ default: m.BudgetDetail })),
)

const searchSchema = z.object({
  highlight: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/finances/budgets/$budgetId')({
  component: BudgetDetailRoute,
  validateSearch: searchSchema,
})

function BudgetDetailRoute() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <BudgetDetailPage />
    </Suspense>
  )
}
