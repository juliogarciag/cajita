// Pure search/rank module for the global Cmd+K palette.
//
// Searches expense items (description + their expense_item_notes content)
// and ranks the results. Bare numeric tokens additionally match against
// amount_usd_cents and amount_soles_cents.

import type { ExpenseItem } from '#/lib/expense-items-collection'
import type { ExpenseItemNote } from '#/lib/expense-item-notes-collection'

const RESULT_CAP = 30
const NOTE_EXCERPT_RADIUS = 40 // chars on each side of the first match

export type ExpenseItemResult = {
  kind: 'expense_item'
  item: ExpenseItem
  note?: ExpenseItemNote
  noteText: string
  score: number
  descHits: string[]
  noteHits: string[]
  amountHits: string[]
}

export type SearchResult = ExpenseItemResult

export type SearchData = {
  expenseItems: readonly ExpenseItem[]
  expenseItemNotes: readonly ExpenseItemNote[]
}

// --- Tokenization ----------------------------------------------------------

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

// Returns the parsed amount in dollars (or whatever unit) if the token is
// numeric, else null. Strips currency symbols, grouping commas, whitespace.
// "1500" -> 1500, "$1,500.50" -> 1500.5, "abc" -> null.
export function parseAmountToken(token: string): number | null {
  const cleaned = token.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// --- HTML to plain text ----------------------------------------------------

// Note content is Tiptap HTML. Strip tags and decode the few entities Tiptap
// emits so substring/excerpt logic operates on user-visible text.
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function htmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

// --- Highlight regex / excerpt --------------------------------------------

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildHighlightPattern(terms: readonly string[]): RegExp | null {
  const filtered = terms.filter((t) => t.length > 0)
  if (filtered.length === 0) return null
  const escaped = filtered.map(escapeRegex).join('|')
  return new RegExp(`(${escaped})`, 'gi')
}

// Returns a ~80 char excerpt around the first match of any token.
// If no token matches, returns the first 80 chars (truncated with ellipsis).
export function buildExcerpt(text: string, terms: readonly string[]): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  let firstHit = -1
  for (const t of terms) {
    if (!t) continue
    const i = lower.indexOf(t)
    if (i !== -1 && (firstHit === -1 || i < firstHit)) firstHit = i
  }
  const radius = NOTE_EXCERPT_RADIUS
  if (firstHit === -1) {
    if (text.length <= radius * 2) return text
    return text.slice(0, radius * 2).trimEnd() + '…'
  }
  const start = Math.max(0, firstHit - radius)
  const end = Math.min(text.length, firstHit + radius)
  let out = text.slice(start, end)
  if (start > 0) out = '…' + out.replace(/^\S*\s/, '')
  if (end < text.length) out = out.replace(/\s\S*$/, '') + '…'
  return out
}

// --- Search/rank -----------------------------------------------------------

type Scored<T> = { value: T; score: number; date: string }

export function runSearch(query: string, data: SearchData): SearchResult[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const noteByItemId = new Map<string, ExpenseItemNote>()
  for (const n of data.expenseItemNotes) noteByItemId.set(n.expense_item_id, n)

  const scored: Scored<SearchResult>[] = []

  for (const it of data.expenseItems) {
    const note = noteByItemId.get(it.id)
    const noteText = note ? htmlToText(note.content) : ''
    const amounts: number[] = []
    if (it.amount_usd_cents != null) amounts.push(Math.abs(it.amount_usd_cents))
    if (it.amount_soles_cents != null) amounts.push(Math.abs(it.amount_soles_cents))
    const result = scoreCandidate({
      tokens,
      description: it.description,
      noteText,
      amountsCents: amounts,
    })
    if (!result) continue
    scored.push({
      value: {
        kind: 'expense_item',
        item: it,
        note,
        noteText,
        score: result.score,
        descHits: result.descHits,
        noteHits: result.noteHits,
        amountHits: result.amountHits,
      },
      score: result.score,
      date: it.date,
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.date.localeCompare(a.date)
  })

  return scored.slice(0, RESULT_CAP).map((s) => s.value)
}

type CandidateScore = {
  score: number
  descHits: string[]
  noteHits: string[]
  amountHits: string[]
}

function scoreCandidate(args: {
  tokens: string[]
  description: string
  noteText: string
  amountsCents: number[]
}): CandidateScore | null {
  const desc = args.description.toLowerCase()
  const noteLower = args.noteText.toLowerCase()
  let score = 0
  const descHits: string[] = []
  const noteHits: string[] = []
  const amountHits: string[] = []

  for (const token of args.tokens) {
    if (desc.includes(token)) {
      score += 3
      descHits.push(token)
      continue
    }
    if (noteLower && noteLower.includes(token)) {
      score += 2
      noteHits.push(token)
      continue
    }
    const numeric = parseAmountToken(token)
    if (numeric !== null) {
      const cents = Math.round(numeric * 100)
      if (args.amountsCents.some((a) => a === cents)) {
        score += 2
        amountHits.push(token)
        continue
      }
    }
    return null // token unmatched -> reject candidate (AND across tokens)
  }

  return { score, descHits, noteHits, amountHits }
}
