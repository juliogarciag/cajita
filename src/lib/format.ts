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

export type DateFormatOption = 'DD/MM/YYYY' | 'YYYY-MM-DD'

export function formatDisplayDate(dateStr: string, fmt: DateFormatOption = 'DD/MM/YYYY'): string {
  if (!dateStr) return ''
  if (fmt === 'YYYY-MM-DD') return dateStr
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

export function toDateFnsFormat(fmt: DateFormatOption): string {
  return fmt === 'DD/MM/YYYY' ? 'dd/MM/yyyy' : 'yyyy-MM-dd'
}

/**
 * The calendar date in the *local* timezone, as YYYY-MM-DD.
 *
 * Not `toISOString()`: that converts to UTC first, so anywhere west of
 * Greenwich the evening already belongs to tomorrow — in Lima (UTC-5) every
 * new expense entered after 19:00 defaulted to the next day.
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
