import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const BudgetDetailPage = lazy(() =>
  import('#/components/BudgetDetail.js').then((m) => ({ default: m.BudgetDetail })),
)

export const Route = createFileRoute('/_authenticated/finances/budgets/$budgetId')({
  component: BudgetDetailRoute,
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
