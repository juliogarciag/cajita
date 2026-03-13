import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

interface TooltipProps {
  children: ReactNode
  content: string
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={0}>
      {children}
    </RadixTooltip.Provider>
  )
}

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={4}
          className="z-50 rounded px-2 py-1 text-xs text-gray-100 bg-gray-800 shadow-sm"
        >
          {content}
          <RadixTooltip.Arrow className="fill-gray-800" width={8} height={4} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
