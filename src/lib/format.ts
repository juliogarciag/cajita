const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

export function parseDollarsTocents(input: string): number | null {
  const cleaned = input.replace(/[,$\s]/g, '')
  const num = Number.parseFloat(cleaned)
  if (Number.isNaN(num)) return null
  return Math.round(num * 100)
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year}`
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

const solesFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatSoles(cents: number): string {
  return solesFormatter.format(cents / 100)
}
