'use client'

import { formatPrice } from '@/lib/utils/currency'
import type { AuctionHistoryEntry } from '@/lib/hooks/useAuctionHistory'

interface Props {
  history: AuctionHistoryEntry[]
}

export function AuctionHistory({ history }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="font-bold text-sm text-gray-400">Auction Log</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {history.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-4">No players resolved yet</p>
        )}
        {history.map(({ player, team }) => (
          <div
            key={player.id}
            className={`p-2 rounded-lg border ${
              team ? 'bg-gray-800 border-gray-700' : 'bg-gray-900 border-gray-800 opacity-60'
            }`}
          >
            <p className="text-sm font-bold text-white truncate">{player.name}</p>
            {team ? (
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                  <span className="text-xs font-semibold truncate" style={{ color: team.color }}>
                    {team.name}
                  </span>
                </div>
                <span className="text-xs font-bold text-yellow-400 flex-shrink-0">
                  {formatPrice(player.final_price ?? 0)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-red-400 mt-1">Unsold</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
