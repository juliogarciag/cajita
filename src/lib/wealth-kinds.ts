/**
 * What a wealth source is, and how the dashboard's three views are built from
 * those kinds.
 *
 * The kinds partition the sources exactly, which is what makes the views
 * trustworthy: liquid and equity have no overlap and together they are net
 * worth. A number that appears in one view never appears in another.
 */

export const WEALTH_KINDS = [
  { key: 'cash', label: 'Cash', hint: 'Bank accounts, money you can spend today' },
  { key: 'investment', label: 'Investments', hint: 'Brokerage, crypto — sellable but not spent' },
  { key: 'property', label: 'Property', hint: 'A home or other asset held long term' },
  { key: 'debt', label: 'Debt', hint: 'A mortgage or loan. Record it as a negative amount.' },
] as const

export type WealthKind = (typeof WEALTH_KINDS)[number]['key']

export const DEFAULT_WEALTH_KIND: WealthKind = 'cash'

export function isWealthKind(value: string): value is WealthKind {
  return WEALTH_KINDS.some((k) => k.key === value)
}

export function kindLabel(kind: string): string {
  return WEALTH_KINDS.find((k) => k.key === kind)?.label ?? kind
}

export const METRICS = [
  { key: 'net', label: 'Net worth', kinds: ['cash', 'investment', 'property', 'debt'] },
  { key: 'liquid', label: 'Liquid', kinds: ['cash', 'investment'] },
  { key: 'equity', label: 'Equity', kinds: ['property', 'debt'] },
] as const

export type MetricKey = (typeof METRICS)[number]['key']

export const DEFAULT_METRIC: MetricKey = 'net'

export function metricKinds(metric: MetricKey): readonly string[] {
  return (METRICS.find((m) => m.key === metric) ?? METRICS[0]).kinds
}
