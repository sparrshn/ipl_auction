'use client'

import { useState } from 'react'
import { formatPrice } from '@/lib/utils/currency'
import type { Team, Player } from '@/lib/supabase/types'

interface Props {
  teams: Team[]
  players: Player[]
  myTeamId: string | null
}

export function TeamSidebar({ teams, players, myTeamId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const soldPlayers = players.filter((p) => p.status === 'sold')

  function getTeamPlayers(teamId: string) {
    return soldPlayers.filter((p) => p.sold_to_team_id === teamId)
  }

  return (
    <div className="space-y-2">
      <h3 className="font-bold text-sm text-gray-400 px-1">Teams</h3>
      {teams.map((team) => {
        const isMe = team.id === myTeamId
        const teamPlayers = getTeamPlayers(team.id)
        const isExpanded = expanded === team.id

        return (
          <div
            key={team.id}
            className={`rounded-xl border transition-colors border-gray-800 bg-gray-900 ${isMe ? 'ring-1 ring-blue-500' : ''}`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : team.id)}
              className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: isMe ? team.color : undefined }}>
                  {team.name}
                  {isMe && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                </p>
                <p className="text-xs text-gray-400">{formatPrice(team.budget_remaining)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black text-white tabular-nums">
                  {teamPlayers.length}<span className="text-gray-600 font-normal">/16</span>
                </span>
                <p className="text-xs text-gray-600">{isExpanded ? '▲' : '▼'}</p>
              </div>
            </button>

            {isExpanded && teamPlayers.length > 0 && (
              <div className="px-3 pb-3 space-y-1">
                {teamPlayers.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs py-1 border-t border-gray-800">
                    <span className="text-gray-300">{p.name}</span>
                    <span className="text-yellow-400">{formatPrice(p.final_price ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {isExpanded && teamPlayers.length === 0 && (
              <p className="px-3 pb-3 text-xs text-gray-600">No players yet</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
