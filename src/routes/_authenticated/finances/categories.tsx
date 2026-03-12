import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const CategoriesList = lazy(() =>
  import('#/components/CategoriesList.js').then((m) => ({ default: m.CategoriesList })),
)

export const Route = createFileRoute('/_authenticated/finances/categories')({
  component: CategoriesPage,
})

function CategoriesPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <CategoriesList />
    </Suspense>
  )
}
