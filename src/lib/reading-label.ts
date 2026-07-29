const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The name a reading gets when none is given: "March reading", or "March
 * reading 2" when that month already holds one.
 *
 * Numbered by what the month already contains rather than by a running count,
 * so deleting a reading doesn't leave a gap in the naming. Shared between the
 * dialog (which shows it as a placeholder) and the server (which applies it),
 * so the name you're shown is the name you get.
 */
export function defaultReadingLabel(date: string, labelsInSameMonth: readonly string[]): string {
  const month = Number(date.split('-')[1])
  const base = `${MONTHS[month - 1] ?? date.slice(0, 7)} reading`

  const taken = new Set(labelsInSameMonth)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    if (!taken.has(`${base} ${n}`)) return `${base} ${n}`
  }
}

/** Whether two ISO dates fall in the same calendar month. */
export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}
