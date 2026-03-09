import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const MovementsTable = lazy(() =>
  import('#/components/MovementsTable.js').then((m) => ({ default: m.MovementsTable })),
)

export const Route = createFileRoute('/_authenticated/movements')({
  component: MovementsPage,
})

function MovementsPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <MovementsTable />
    </Suspense>
  )
}
