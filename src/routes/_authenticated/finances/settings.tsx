import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const FinancesSettings = lazy(() =>
  import('#/components/FinancesSettings.js').then((m) => ({ default: m.FinancesSettings })),
)

export const Route = createFileRoute('/_authenticated/finances/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <FinancesSettings />
    </Suspense>
  )
}
