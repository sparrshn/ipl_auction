const LAKH = 100_000
const CRORE = 10_000_000

interface BidIncrement {
  label: string
  amount: number
}

/**
 * Context-aware bid increment presets based on current bid amount
 */
export function getBidIncrements(currentBid: number): BidIncrement[] {
  if (currentBid < 50 * LAKH) {
    return [
      { label: '+0.05Cr', amount: 5 * LAKH },
      { label: '+0.1Cr', amount: 10 * LAKH },
      { label: '+0.2Cr', amount: 20 * LAKH },
    ]
  }
  if (currentBid < 2 * CRORE) {
    return [
      { label: '+0.1Cr', amount: 10 * LAKH },
      { label: '+0.25Cr', amount: 25 * LAKH },
      { label: '+0.5Cr', amount: 50 * LAKH },
    ]
  }
  if (currentBid < 10 * CRORE) {
    return [
      { label: '+0.25Cr', amount: 25 * LAKH },
      { label: '+0.5Cr', amount: 50 * LAKH },
      { label: '+1Cr', amount: CRORE },
    ]
  }
  return [
    { label: '+0.5Cr', amount: 50 * LAKH },
    { label: '+1Cr', amount: CRORE },
    { label: '+2Cr', amount: 2 * CRORE },
  ]
}
