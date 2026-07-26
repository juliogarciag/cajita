import { describe, expect, test } from 'vitest'
import {
  buildExcerpt,
  buildHighlightPattern,
  escapeRegex,
  htmlToText,
  parseAmountToken,
  runSearch,
  tokenize,
  type SearchData,
} from '#/lib/search'
import type { ExpenseItem } from '#/lib/expense-items-collection'
import type { ExpenseItemNote } from '#/lib/expense-item-notes-collection'

const expenseItem = (overrides: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: overrides.id ?? 'ei-1',
  expense_category_id: 'ec-1',
  description: 'Annual hosting',
  date: '2026-03-01',
  amount_soles_cents: null,
  amount_usd_cents: 45000,
  sort_position: 0,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
})

const expenseItemNote = (overrides: Partial<ExpenseItemNote> = {}): ExpenseItemNote => ({
  id: overrides.id ?? 'ein-1',
  expense_item_id: overrides.expense_item_id ?? 'ei-1',
  team_id: 't-1',
  content: '<p>renewal sent to billing@example.com</p>',
  created_by_user_id: 'u-1',
  updated_by_user_id: 'u-1',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
})

const data = (overrides: Partial<SearchData> = {}): SearchData => ({
  expenseItems: [],
  expenseItemNotes: [],
  ...overrides,
})

// --- Helpers ----------------------------------------------------------------

describe('tokenize', () => {
  test('lowercases and splits on whitespace', () => {
    expect(tokenize('  Notion  Annual  ')).toEqual(['notion', 'annual'])
  })

  test('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('parseAmountToken', () => {
  test('parses bare numbers', () => {
    expect(parseAmountToken('1500')).toBe(1500)
    expect(parseAmountToken('1500.50')).toBe(1500.5)
  })

  test('strips currency symbols and grouping commas', () => {
    expect(parseAmountToken('$1,500')).toBe(1500)
    expect(parseAmountToken('$1,500.00')).toBe(1500)
  })

  test('returns null for non-numeric tokens', () => {
    expect(parseAmountToken('notion')).toBeNull()
    expect(parseAmountToken('annual1')).toBeNull()
    expect(parseAmountToken('')).toBeNull()
    expect(parseAmountToken('1.2.3')).toBeNull()
  })
})

describe('htmlToText', () => {
  test('strips Tiptap markup', () => {
    expect(htmlToText('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  test('inserts space at block boundaries', () => {
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One Two')
  })

  test('decodes the few entities Tiptap emits', () => {
    expect(htmlToText('<p>R &amp; D</p>')).toBe('R & D')
  })

  test('handles empty input', () => {
    expect(htmlToText('')).toBe('')
  })
})

describe('escapeRegex', () => {
  test('escapes regex metachars', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c')
  })
})

describe('buildHighlightPattern', () => {
  test('builds a global case-insensitive alternation', () => {
    const re = buildHighlightPattern(['Notion', 'annual'])
    expect(re).toBeInstanceOf(RegExp)
    expect('Annual notion'.split(re!).filter((s) => re!.test(s)).length).toBeGreaterThan(0)
  })

  test('returns null when no terms', () => {
    expect(buildHighlightPattern([])).toBeNull()
  })
})

describe('buildExcerpt', () => {
  test('returns text unchanged when shorter than the window', () => {
    expect(buildExcerpt('a short note', ['note'])).toBe('a short note')
  })

  test('clips around the first match', () => {
    const text =
      'before before before before before before before MATCH after after after after after after after after'
    const out = buildExcerpt(text, ['match'])
    expect(out).toContain('MATCH')
    expect(out.length).toBeLessThan(text.length)
    expect(out.startsWith('…') || out.endsWith('…')).toBe(true)
  })
})

// --- runSearch --------------------------------------------------------------

describe('runSearch', () => {
  test('empty query returns no results', () => {
    expect(runSearch('', data({ expenseItems: [expenseItem()] }))).toEqual([])
    expect(runSearch('   ', data({ expenseItems: [expenseItem()] }))).toEqual([])
  })

  test('matches item description (case-insensitive)', () => {
    const results = runSearch('HOSTING', data({ expenseItems: [expenseItem()] }))
    expect(results.length).toBe(1)
    expect(results[0].descHits).toEqual(['hosting'])
    expect(results[0].noteHits).toEqual([])
  })

  test('matches item note content via the join', () => {
    const it = expenseItem()
    const note = expenseItemNote({ expense_item_id: it.id })
    const results = runSearch('renewal', data({ expenseItems: [it], expenseItemNotes: [note] }))
    expect(results.length).toBe(1)
    expect(results[0].noteHits).toEqual(['renewal'])
    expect(results[0].descHits).toEqual([])
  })

  test('AND semantics across tokens', () => {
    const a = expenseItem({ id: 'a', description: 'Notion subscription' })
    const b = expenseItem({ id: 'b', description: 'Notion family plan' })
    const results = runSearch('notion subscription', data({ expenseItems: [a, b] }))
    expect(results.map((r) => r.item.id)).toEqual(['a'])
  })

  test('one token can match description and another the note', () => {
    const it = expenseItem({ id: 'x', description: 'Notion subscription' })
    const n = expenseItemNote({ expense_item_id: it.id, content: '<p>annual plan</p>' })
    const results = runSearch('notion annual', data({ expenseItems: [it], expenseItemNotes: [n] }))
    expect(results.length).toBe(1)
    expect(results[0].descHits).toEqual(['notion'])
    expect(results[0].noteHits).toEqual(['annual'])
  })

  test('numeric token matches amount_usd_cents', () => {
    const it = expenseItem({ id: 'p', amount_usd_cents: 150000, description: 'Random' })
    const results = runSearch('1500', data({ expenseItems: [it] }))
    expect(results.length).toBe(1)
    expect(results[0].amountHits).toEqual(['1500'])
  })

  test('numeric with currency symbol matches', () => {
    const it = expenseItem({ amount_usd_cents: 150050 })
    const results = runSearch('$1,500.50', data({ expenseItems: [it] }))
    expect(results.length).toBe(1)
  })

  test('numeric token also matches amount_soles_cents', () => {
    const it = expenseItem({
      description: 'unrelated',
      amount_usd_cents: 10000,
      amount_soles_cents: 450000, // S/ 4500
    })
    const results = runSearch('4500', data({ expenseItems: [it] }))
    expect(results.length).toBe(1)
    expect(results[0].amountHits).toEqual(['4500'])
  })

  test('null amounts do not match numeric tokens', () => {
    const it = expenseItem({ description: 'unrelated', amount_usd_cents: null })
    const results = runSearch('1500', data({ expenseItems: [it] }))
    expect(results).toEqual([])
  })

  test('description-only token wins over amount on the same record', () => {
    // description contains "1500" too, so it should score 3 (desc) not 2 (amount)
    const it = expenseItem({ description: 'lot 1500', amount_usd_cents: 150000 })
    const results = runSearch('1500', data({ expenseItems: [it] }))
    expect(results.length).toBe(1)
    expect(results[0].descHits).toEqual(['1500'])
    expect(results[0].amountHits).toEqual([])
    expect(results[0].score).toBe(3)
  })

  test('ranks description matches above note matches', () => {
    const a = expenseItem({ id: 'a', description: 'shared phrase' })
    const b = expenseItem({ id: 'b', description: 'unrelated' })
    const bn = expenseItemNote({ expense_item_id: 'b', content: '<p>shared phrase</p>' })
    const results = runSearch(
      'shared phrase',
      data({ expenseItems: [a, b], expenseItemNotes: [bn] }),
    )
    expect(results.length).toBe(2)
    expect(results[0].item.id).toBe('a')
    expect(results[1].item.id).toBe('b')
  })

  test('tie-breaker is most-recent date desc', () => {
    const a = expenseItem({ id: 'a', description: 'shared', date: '2026-01-01' })
    const b = expenseItem({ id: 'b', description: 'shared', date: '2026-04-01' })
    const c = expenseItem({ id: 'c', description: 'shared', date: '2026-02-01' })
    const results = runSearch('shared', data({ expenseItems: [a, b, c] }))
    expect(results.map((r) => r.item.id)).toEqual(['b', 'c', 'a'])
  })

  test('respects the result cap of 30', () => {
    const expenseItems = Array.from({ length: 50 }, (_, i) =>
      expenseItem({
        id: `ei-${i}`,
        description: 'shared phrase',
        date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      }),
    )
    const results = runSearch('shared', data({ expenseItems }))
    expect(results.length).toBe(30)
  })

  test('rejects candidate when one token has no match', () => {
    const it = expenseItem({ description: 'Notion subscription' })
    const results = runSearch('notion zzz', data({ expenseItems: [it] }))
    expect(results).toEqual([])
  })
})
