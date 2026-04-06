const LAKH = 100_000
const CRORE = 10_000_000

/**
 * Parse price string like "200L", "2Cr", "200" into rupees (integer)
 */
export function parsePrice(raw: string): number {
  const s = raw.trim()
  const lower = s.toLowerCase()

  if (lower.endsWith('cr')) {
    const val = parseFloat(s.slice(0, -2))
    if (isNaN(val)) throw new Error(`Invalid price: ${raw}`)
    return Math.round(val * CRORE)
  }

  if (lower.endsWith('l')) {
    const val = parseFloat(s.slice(0, -1))
    if (isNaN(val)) throw new Error(`Invalid price: ${raw}`)
    return Math.round(val * LAKH)
  }

  // Plain number → assume crores
  const val = parseFloat(s)
  if (isNaN(val)) throw new Error(`Invalid price: ${raw}`)
  return Math.round(val * CRORE)
}

/**
 * Format rupees — always in Crores.
 * e.g. 50L → "0.5 Cr", 2Cr → "2 Cr", 100Cr → "100 Cr"
 */
export function formatPrice(rupees: number): string {
  const cr = rupees / CRORE
  return `${parseFloat(cr.toFixed(2))} Cr`
}

/**
 * Compact short form — always in Crores.
 */
export function formatPriceShort(rupees: number): string {
  const cr = rupees / CRORE
  return `${parseFloat(cr.toFixed(2))}Cr`
}
