import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const BudgetList = lazy(() =>
  import('#/components/BudgetList.js').then((m) => ({ default: m.BudgetList })),
)

export const Route = createFileRoute('/_authenticated/budgets')({
  component: BudgetsPage,
})

function BudgetsPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <BudgetList />
    </Suspense>
  )
}
