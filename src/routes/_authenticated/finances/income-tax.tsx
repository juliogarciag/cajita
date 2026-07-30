import { lazy, Suspense, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const IncomeTaxPage = lazy(() =>
  import('#/components/IncomeTaxPage.js').then((m) => ({ default: m.IncomeTaxPage })),
)

export const Route = createFileRoute('/_authenticated/finances/income-tax')({
  component: IncomeTaxRoute,
})

function IncomeTaxRoute() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <IncomeTaxPage />
    </Suspense>
  )
}
