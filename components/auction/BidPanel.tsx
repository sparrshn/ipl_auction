'use client'

import { useState } from 'react'
import { getBidIncrements } from '@/lib/utils/bid-increments'
import { formatPrice, parsePrice } from '@/lib/utils/currency'

interface Props {
  currentBid: number
  myBudget: number
  timerExpired: boolean
  paused?: boolean
  onBid: (amount: number) => Promise<void>
  disabled?: boolean
}

export function BidPanel({ currentBid, myBudget, timerExpired, paused = false, onBid, disabled }: Props) {
  const [customAmount, setCustomAmount] = useState('')
  const [bidding, setBidding] = useState(false)
  const [error, setError] = useState('')

  const increments = getBidIncrements(currentBid)

  async function placeBid(amount: number) {
    if (amount > myBudget) {
      setError('Insufficient budget')
      return
    }
    setError('')
    setBidding(true)
    try {
      await onBid(amount)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bid failed')
    } finally {
      setBidding(false)
    }
  }

  async function handleCustomBid() {
    setError('')
    let amount: number
    try {
      amount = parsePrice(customAmount)
    } catch {
      setError('Invalid amount (e.g. 50L, 2Cr, or 5000000)')
      return
    }
    if (amount <= currentBid) {
      setError(`Must be more than ${formatPrice(currentBid)}`)
      return
    }
    await placeBid(amount)
    setCustomAmount('')
  }

  const isDisabled = disabled || timerExpired || paused || bidding

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3">
      {timerExpired && (
        <p className="text-center text-red-400 text-sm font-bold">Timer expired — no more bids</p>
      )}

      {/* Increment buttons */}
      <div className="grid grid-cols-3 gap-2">
        {increments.map((inc) => (
          <button
            key={inc.label}
            onClick={() => placeBid(currentBid + inc.amount)}
            disabled={isDisabled || currentBid + inc.amount > myBudget}
            className="py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition-colors"
          >
            {inc.label}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Amount in Cr (e.g. 2.5)"
          disabled={isDisabled}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
          onKeyDown={(e) => e.key === 'Enter' && handleCustomBid()}
        />
        <button
          onClick={handleCustomBid}
          disabled={isDisabled || !customAmount.trim()}
          className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition-colors"
        >
          Bid
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <p className="text-xs text-gray-500 text-center">
        Your budget: <span className="text-gray-300">{formatPrice(myBudget)}</span>
      </p>
    </div>
  )
}
