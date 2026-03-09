import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, ReactNode } from 'react'

interface SortableRowProps {
  id: string
  className?: string
  style?: CSSProperties
  handle: ReactNode
  children: ReactNode
}

export function SortableRow({ id, className, style, handle, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  // Combine virtualizer translateY with sortable transform
  const sortableTransform = CSS.Translate.toString(transform)
  const baseTransform = style?.transform ?? ''
  const combinedTransform = [baseTransform, sortableTransform].filter(Boolean).join(' ')

  const mergedStyle: CSSProperties = {
    ...style,
    transform: combinedTransform || undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={setNodeRef} style={mergedStyle} className={className} data-row-id={id} {...attributes}>
      <div
        {...listeners}
        className="flex w-[28px] shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
      >
        {handle}
      </div>
      {children}
    </div>
  )
}
