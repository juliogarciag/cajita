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
import type { Movement } from '#/lib/movements-collection'
import type { MovementNote } from '#/lib/movement-notes-collection'
import type { BudgetItem } from '#/lib/budget-items-collection'
import type { BudgetItemNote } from '#/lib/budget-item-notes-collection'

const movement = (overrides: Partial<Movement> = {}): Movement => ({
  id: overrides.id ?? 'm-1',
  description: 'Notion subscription',
  date: '2026-04-14',
  amount_cents: -1200,
  category_id: null,
  sort_position: 0,
  source: 'manual',
  recurring_template_id: null,
  recurring_period: null,
  confirmed: true,
  created_at: '2026-04-14T00:00:00Z',
  updated_at: '2026-04-14T00:00:00Z',
  ...overrides,
})

const movementNote = (overrides: Partial<MovementNote> = {}): MovementNote => ({
  id: overrides.id ?? 'mn-1',
  movement_id: overrides.movement_id ?? 'm-1',
  team_id: 't-1',
  content: '<p>paid via Stripe with the personal card</p>',
  created_by_user_id: 'u-1',
  updated_by_user_id: 'u-1',
  created_at: '2026-04-14T00:00:00Z',
  updated_at: '2026-04-14T00:00:00Z',
  ...overrides,
})

const budgetItem = (overrides: Partial<BudgetItem> = {}): BudgetItem => ({
  id: overrides.id ?? 'bi-1',
  budget_id: 'b-1',
  description: 'Annual hosting',
  date: '2026-03-01',
  amount_local_cents: null,
  amount_cents: -45000,
  accounting_date: null,
  movement_id: null,
  sort_position: 0,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
})

const budgetItemNote = (overrides: Partial<BudgetItemNote> = {}): BudgetItemNote => ({
  id: overrides.id ?? 'bin-1',
  budget_item_id: overrides.budget_item_id ?? 'bi-1',
  team_id: 't-1',
  content: '<p>renewal sent to billing@example.com</p>',
  created_by_user_id: 'u-1',
  updated_by_user_id: 'u-1',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
})

const data = (overrides: Partial<SearchData> = {}): SearchData => ({
  movements: [],
  movementNotes: [],
  budgetItems: [],
  budgetItemNotes: [],
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
    expect(runSearch('', data({ movements: [movement()] }))).toEqual([])
    expect(runSearch('   ', data({ movements: [movement()] }))).toEqual([])
  })

  test('matches movement description (case-insensitive)', () => {
    const results = runSearch('NOTION', data({ movements: [movement()] }))
    expect(results.length).toBe(1)
    expect(results[0]?.kind).toBe('movement')
    if (results[0]?.kind === 'movement') {
      expect(results[0].descHits).toEqual(['notion'])
      expect(results[0].noteHits).toEqual([])
    }
  })

  test('matches movement note content via the join', () => {
    const m = movement({ description: 'Coffee', amount_cents: -500 })
    const note = movementNote({ movement_id: m.id, content: '<p>Stripe charge</p>' })
    const results = runSearch('stripe', data({ movements: [m], movementNotes: [note] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'movement') {
      expect(results[0].noteHits).toEqual(['stripe'])
      expect(results[0].descHits).toEqual([])
    }
  })

  test('matches budget item description', () => {
    const results = runSearch('hosting', data({ budgetItems: [budgetItem()] }))
    expect(results.length).toBe(1)
    expect(results[0]?.kind).toBe('budget_item')
  })

  test('matches budget item note', () => {
    const it = budgetItem()
    const note = budgetItemNote({ budget_item_id: it.id })
    const results = runSearch('renewal', data({ budgetItems: [it], budgetItemNotes: [note] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'budget_item') {
      expect(results[0].noteHits).toEqual(['renewal'])
    }
  })

  test('AND semantics across tokens', () => {
    const a = movement({ id: 'a', description: 'Notion subscription', amount_cents: -1200 })
    const b = movement({ id: 'b', description: 'Notion family plan', amount_cents: -2000 })
    const results = runSearch('notion subscription', data({ movements: [a, b] }))
    expect(results.map((r) => (r.kind === 'movement' ? r.movement.id : null))).toEqual(['a'])
  })

  test('one token can match description and another the note', () => {
    const m = movement({ id: 'm', description: 'Notion subscription' })
    const n = movementNote({ movement_id: m.id, content: '<p>annual plan</p>' })
    const results = runSearch('notion annual', data({ movements: [m], movementNotes: [n] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'movement') {
      expect(results[0].descHits).toEqual(['notion'])
      expect(results[0].noteHits).toEqual(['annual'])
    }
  })

  test('numeric token matches |amount_cents| (sign-agnostic)', () => {
    const m = movement({ id: 'p', amount_cents: -150000, description: 'Random' })
    const results = runSearch('1500', data({ movements: [m] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'movement') {
      expect(results[0].amountHits).toEqual(['1500'])
    }
  })

  test('numeric with currency symbol matches', () => {
    const m = movement({ amount_cents: 150050 })
    const results = runSearch('$1,500.50', data({ movements: [m] }))
    expect(results.length).toBe(1)
  })

  test('numeric token also matches budget item amount_local_cents', () => {
    const it = budgetItem({
      description: 'unrelated',
      amount_cents: -10000,
      amount_local_cents: -450000, // S/. 4500
    })
    const results = runSearch('4500', data({ budgetItems: [it] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'budget_item') {
      expect(results[0].amountHits).toEqual(['4500'])
    }
  })

  test('description-only token wins over amount on the same record', () => {
    // description contains "1500" too, so it should score 3 (desc) not 2 (amount)
    const m = movement({ description: 'lot 1500', amount_cents: -150000 })
    const results = runSearch('1500', data({ movements: [m] }))
    expect(results.length).toBe(1)
    if (results[0]?.kind === 'movement') {
      expect(results[0].descHits).toEqual(['1500'])
      expect(results[0].amountHits).toEqual([])
      expect(results[0].score).toBe(3)
    }
  })

  test('ranks description matches above note matches', () => {
    const a = movement({ id: 'a', description: 'shared phrase' })
    const b = movement({ id: 'b', description: 'unrelated' })
    const bn = movementNote({ movement_id: 'b', content: '<p>shared phrase</p>' })
    const results = runSearch('shared phrase', data({ movements: [a, b], movementNotes: [bn] }))
    expect(results.length).toBe(2)
    expect(results[0]?.kind === 'movement' ? results[0].movement.id : null).toBe('a')
    expect(results[1]?.kind === 'movement' ? results[1].movement.id : null).toBe('b')
  })

  test('tie-breaker is most-recent date desc', () => {
    const a = movement({ id: 'a', description: 'shared', date: '2026-01-01' })
    const b = movement({ id: 'b', description: 'shared', date: '2026-04-01' })
    const c = movement({ id: 'c', description: 'shared', date: '2026-02-01' })
    const results = runSearch('shared', data({ movements: [a, b, c] }))
    expect(results.map((r) => (r.kind === 'movement' ? r.movement.id : null))).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  test('respects the result cap of 30', () => {
    const movements = Array.from({ length: 50 }, (_, i) =>
      movement({
        id: `m-${i}`,
        description: 'shared phrase',
        date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      }),
    )
    const results = runSearch('shared', data({ movements }))
    expect(results.length).toBe(30)
  })

  test('rejects candidate when one token has no match', () => {
    const m = movement({ description: 'Notion subscription' })
    const results = runSearch('notion zzz', data({ movements: [m] }))
    expect(results).toEqual([])
  })

  test('frozen and unconfirmed movements are still searched', () => {
    const m = movement({ confirmed: false, source: 'recurring', description: 'Frozen test' })
    const results = runSearch('frozen', data({ movements: [m] }))
    expect(results.length).toBe(1)
  })
})
