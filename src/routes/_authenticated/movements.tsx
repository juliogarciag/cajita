import { createFileRoute } from '@tanstack/react-router'
import { MovementsTable } from '#/components/MovementsTable.js'

export const Route = createFileRoute('/_authenticated/movements')({
  component: MovementsPage,
})

function MovementsPage() {
  return <MovementsTable />
}
