import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const ExpenseCategoryList = lazy(() =>
  import('#/components/ExpenseCategoryList.js').then((m) => ({ default: m.ExpenseCategoryList })),
)

export const Route = createFileRoute('/_authenticated/finances/expense-categories/')({
  component: ExpenseCategoriesPage,
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
