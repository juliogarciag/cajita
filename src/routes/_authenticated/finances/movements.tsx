import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { generateRecurringMovements } from '#/server/recurring-movements.js'

const MovementsTable = lazy(() =>
  import('#/components/MovementsTable.js').then((m) => ({ default: m.MovementsTable })),
)

const searchSchema = z.object({
  highlight: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/finances/movements')({
  component: MovementsPage,
  validateSearch: searchSchema,
})

function MovementsPage() {
  const { highlight } = Route.useSearch()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Generate recurring movement placeholders idempotently on each page load.
    // Uses ON CONFLICT DO NOTHING so concurrent tabs are safe.
    generateRecurringMovements().catch(() => {})
  }, [])

  if (!mounted) return null

  return (
    <Suspense>
      <MovementsTable highlightId={highlight} />
    </Suspense>
  )
}
