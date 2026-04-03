import type { CSSProperties, ReactNode } from 'react'

export const ROW_HEIGHT = 40

interface TableRowProps {
  id?: string
  children: ReactNode
  frozen?: boolean
  highlight?: boolean
  className?: string
  style?: CSSProperties
  'data-row-id'?: string
}

export function TableRow({
  children,
  frozen = false,
  highlight = false,
  className = '',
  style,
  ...rest
}: TableRowProps) {
  return (
    <div
      className={`flex items-center border-b border-gray-100 text-sm ${
        highlight ? 'bg-blue-100' : frozen ? '' : 'hover:bg-gray-50'
      } ${className}`}
      style={{ height: ROW_HEIGHT, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}

// Standard column widths used across tables
export const COL = {
  description: 'w-[260px]',
  date: 'w-[130px]',
  amount: 'w-[120px]',
  status: 'w-[90px]',
  actions: 'w-[80px]',
} as const

interface TableCellProps {
  children: ReactNode
  width: string
  className?: string
}

export function TableCell({ children, width, className = '' }: TableCellProps) {
  return (
    <div className={`${width} shrink-0 px-1 ${className}`}>
      {children}
    </div>
  )
}

interface TableHeaderProps {
  children: ReactNode
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </div>
  )
}

interface TableHeaderCellProps {
  children: ReactNode
  width: string
  className?: string
}

export function TableHeaderCell({ children, width, className = '' }: TableHeaderCellProps) {
  return (
    <div className={`${width} shrink-0 px-3 py-2 ${className}`}>
      {children}
    </div>
  )
}
