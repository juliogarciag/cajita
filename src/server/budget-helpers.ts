import { db } from '#/db/index.js'

export async function recalculateRemaining(budgetId: string): Promise<void> {
  const budget = await db
    .selectFrom('budgets')
    .selectAll()
    .where('id', '=', budgetId)
    .executeTakeFirstOrThrow()

  if (!budget.remaining_movement_id) return

  // Check if the remaining movement is frozen
  const { isMovementFrozen } = await import('./movements.js')
  if (await isMovementFrozen(budget.remaining_movement_id)) return // silently skip

  // Sum all items
  const result = await db
    .selectFrom('budget_items')
    .select(db.fn.sum<number>('amount_cents').as('total'))
    .where('budget_id', '=', budgetId)
    .executeTakeFirst()

  const itemsTotal = Number(result?.total) || 0
  // annual_amount_cents is positive ($500 = 50000), items are negative ($300 spent = -30000)
  // remaining to spend = annual + items = 50000 + (-30000) = 20000
  // EOY movement is negative (projected expense): -20000
  const remaining = -((budget.annual_amount_cents as number) + itemsTotal)

  await db
    .updateTable('movements')
    .set({ amount_cents: remaining, updated_at: new Date() })
    .where('id', '=', budget.remaining_movement_id)
    .execute()
}
