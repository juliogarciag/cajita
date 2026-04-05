import { useMemo } from 'react'
import type { Movement } from './movements-collection.js'
import type { Checkpoint } from './checkpoints-collection.js'

interface CheckpointBoundary {
  date: string
  sort_position: number
}

/**
 * Computes the checkpoint boundary and set of frozen movement IDs
 * from a list of checkpoints and movements.
 */
export function useCheckpointBoundary(checkpoints: Checkpoint[], movements: Movement[]) {
  const activeCheckpoint: Checkpoint | null = checkpoints.length > 0 ? checkpoints[0] : null

  const boundary = useMemo<CheckpointBoundary | null>(() => {
    if (!activeCheckpoint) return null
    const m = movements.find((mov) => mov.id === activeCheckpoint.movement_id)
    if (!m) return null
    return { date: m.date, sort_position: m.sort_position }
  }, [activeCheckpoint, movements])

  const frozenMovementIds = useMemo(() => {
    if (!boundary) return new Set<string>()
    const set = new Set<string>()
    for (const m of movements) {
      const frozen =
        m.date < boundary.date ||
        (m.date === boundary.date && m.sort_position <= boundary.sort_position)
      if (frozen) set.add(m.id)
    }
    return set
  }, [movements, boundary])

  return { activeCheckpoint, boundary, frozenMovementIds }
}
