import { Fragment, type ReactNode } from 'react'
import { buildHighlightPattern } from '#/lib/search'

type Props = {
  text: string
  terms: readonly string[]
  className?: string
}

// Renders `text` with each occurrence of any term wrapped in a <mark>.
// Case-insensitive. Falls back to the plain text when there are no terms
// or when the text contains no matches.
export function HighlightedText({ text, terms, className }: Props) {
  const pattern = buildHighlightPattern(terms)
  if (!pattern) return <span className={className}>{text}</span>

  const parts = text.split(pattern)
  if (parts.length === 1) return <span className={className}>{text}</span>

  // String.prototype.split with a capturing group interleaves matches into
  // the array. Even indices = plain text, odd indices = matched substring.
  const nodes: ReactNode[] = parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
  return <span className={className}>{nodes}</span>
}
