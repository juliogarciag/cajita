import { db } from '#/db/index.js'

export async function isMovementFrozen(movementId: string): Promise<boolean> {
  // Get the latest checkpoint
  const checkpoint = await db
    .selectFrom('checkpoints')
    .innerJoin('movements', 'movements.id', 'checkpoints.movement_id')
    .select(['movements.date as cp_date', 'movements.sort_position as cp_sort_position'])
    .orderBy('checkpoints.created_at', 'desc')
    .executeTakeFirst()

  if (!checkpoint) return false

  // Get the movement being checked
  const movement = await db
    .selectFrom('movements')
    .select(['date', 'sort_position'])
    .where('id', '=', movementId)
    .executeTakeFirstOrThrow()

  // Frozen if at or before the checkpoint boundary
  return (
    movement.date < checkpoint.cp_date ||
    (movement.date === checkpoint.cp_date && movement.sort_position <= checkpoint.cp_sort_position)
  )
}

export async function recalculateRemaining(budgetId: string): Promise<void> {
  const budget = await db
    .selectFrom('budgets')
    .selectAll()
    .where('id', '=', budgetId)
    .executeTakeFirstOrThrow()

  if (!budget.remaining_movement_id) return

  // Check if the remaining movement is frozen
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
