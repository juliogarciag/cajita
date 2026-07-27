import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const NetWorthTable = lazy(() =>
  import('#/components/NetWorthTable.js').then((m) => ({ default: m.NetWorthTable })),
)

export const Route = createFileRoute('/_authenticated/finances/net-worth')({
  component: NetWorthPage,
})

function NetWorthPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <Suspense>
      <NetWorthTable />
    </Suspense>
  )
}
