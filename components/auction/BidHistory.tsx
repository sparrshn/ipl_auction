'use client'

import { useMemo } from 'react'
import { formatPrice } from '@/lib/utils/currency'
import type { Bid } from '@/lib/supabase/types'

interface Props {
  bids: Bid[]
  timerStartedAt?: string | null
  timerDuration?: number
  paused?: boolean
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function BidHistory({ bids, timerStartedAt, timerDuration = 30, paused = false }: Props) {
  // Capture elapsed only when timerStartedAt changes (i.e. a new bid landed)
  // so the animation-delay is stable between re-renders
  const elapsed = useMemo(() => {
    if (!timerStartedAt) return 0
    return Math.min((Date.now() - new Date(timerStartedAt).getTime()) / 1000, timerDuration)
  }, [timerStartedAt, timerDuration])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="font-bold text-sm text-gray-400">Bid History</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {bids.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-4">No bids yet</p>
        )}
        {bids.map((bid, idx) => {
          const isLeading = idx === 0
          return (
            <div
              key={bid.id}
              className={`rounded-lg overflow-hidden ${
                isLeading ? 'ring-1 ring-yellow-500/60' : ''
              }`}
            >
              <div className={`flex items-center gap-2 p-2 ${isLeading ? 'bg-yellow-950/40' : 'bg-gray-800'}`}>
                {bid.team && (
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: bid.team.color }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: bid.team?.color ?? '#fff' }}>
                    {bid.team?.name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">{timeAgo(bid.placed_at)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-yellow-400">{formatPrice(bid.amount)}</p>
                </div>
              </div>

              {/* Shrinking timer bar — only on leading bid */}
              {isLeading && timerStartedAt && (
                <div className="h-[3px] bg-gray-800 w-full">
                  <div
                    key={timerStartedAt}
                    className="h-full timer-shrink-bar"
                    style={{
                      animationDuration: `${timerDuration}s`,
                      animationDelay: `-${elapsed}s`,
                      animationPlayState: paused ? 'paused' : 'running',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
