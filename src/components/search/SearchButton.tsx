import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

type Props = {
  onClick: () => void
}

export function SearchButton({ onClick }: Props) {
  const isMac = useIsMac()
  const shortcut = isMac ? '⌘K' : 'Ctrl K'
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Search (${shortcut})`}
      className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
    >
      <Search size={14} />
      <span className="hidden md:inline">Search</span>
      <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 md:inline">
        {shortcut}
      </kbd>
    </button>
  )
}

// Detects mac on the client. Defaults to non-mac during SSR; the chip text
// flips on first paint, which is fine for a label.
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform
    setIsMac(/mac/i.test(platform ?? ''))
  }, [])
  return isMac
}
