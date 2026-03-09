import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { CSSProperties, ReactNode } from 'react'

interface DraggableRowProps {
  id: string
  children: ReactNode
}

export function DraggableRow({ id, children }: DraggableRowProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex w-[28px] shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
    >
      {children}
    </div>
  )
}

interface DroppableRowProps {
  id: string
  children: ReactNode
  style?: CSSProperties
  className?: string
}

export function DroppableRow({ id, children, style, className }: DroppableRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className ?? ''} ${isOver ? 'bg-blue-50' : ''}`}
    >
      {children}
    </div>
  )
}
