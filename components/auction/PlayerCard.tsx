'use client'

import { formatPrice } from '@/lib/utils/currency'
import type { Player, Team } from '@/lib/supabase/types'

const ROLE_COLORS: Record<string, string> = {
  Batsman: 'bg-blue-600',
  Bowler: 'bg-red-600',
  'All-Rounder': 'bg-purple-600',
  'Wicket-Keeper': 'bg-teal-600',
}

const IPL_TEAM_COLORS: Record<string, { bg: string; text: string }> = {
  CSK: { bg: '#F9CD1B', text: '#1a1a1a' },
  MI:  { bg: '#004BA0', text: '#ffffff' },
  RCB: { bg: '#EC1C24', text: '#ffffff' },
  KKR: { bg: '#3A225D', text: '#F0B400' },
  DC:  { bg: '#17479E', text: '#ffffff' },
  GT:  { bg: '#1C3660', text: '#A7903D' },
  LSG: { bg: '#A72B2A', text: '#ffffff' },
  PK:  { bg: '#ED1B24', text: '#ffffff' },
  RR:  { bg: '#E8135B', text: '#ffffff' },
  SRH: { bg: '#F26522', text: '#1a1a1a' },
}

interface Props {
  player: Player
  currentBid: number
  leadingTeam: Team | null
}

function PlaneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block ml-1 -translate-y-px rotate-45">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  )
}

export function PlayerCard({ player, currentBid, leadingTeam }: Props) {
  const roleColor = player.role ? ROLE_COLORS[player.role] ?? 'bg-gray-600' : 'bg-gray-600'

  const isOverseas = player.nationality && player.nationality.toLowerCase() !== 'india'

  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-700 shadow-xl text-center">
      {/* Tags row */}
      <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
        <div className={`text-xs font-bold px-3 py-1 rounded-full ${roleColor}`}>
          {player.role ?? 'Player'}
        </div>
        {player.ipl_team && (() => {
          const tc = IPL_TEAM_COLORS[player.ipl_team]
          return (
            <div
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={tc ? { backgroundColor: tc.bg, color: tc.text } : undefined}
            >
              {player.ipl_team}
            </div>
          )
        })()}
        {isOverseas && (
          <div className="text-xs font-bold px-3 py-1 rounded-full bg-orange-700 text-orange-100 flex items-center gap-1">
            <PlaneIcon />Overseas
          </div>
        )}
        {player.uncapped && (
          <div className="text-xs font-bold px-3 py-1 rounded-full bg-gray-700 text-gray-300">
            Uncapped
          </div>
        )}
        {player.is_captain && (
          <div className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-700 text-yellow-200">
            Captain
          </div>
        )}
      </div>

      {/* Player name */}
      <h2 className="text-2xl font-black text-white leading-tight mb-1">
        {player.name}
      </h2>


      <div className="border-t border-gray-800 my-3" />

      {/* Base price */}
      <p className="text-xs text-gray-500 mb-1">Base Price</p>
      <p className="text-gray-400 font-semibold">{formatPrice(player.base_price)}</p>

      {/* Current bid */}
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-1">Current Bid</p>
        <p className="text-3xl font-black text-yellow-400">{formatPrice(currentBid)}</p>
        {leadingTeam ? (
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: leadingTeam.color }} />
            <span className="text-sm font-bold" style={{ color: leadingTeam.color }}>
              {leadingTeam.name}
            </span>
          </div>
        ) : (
          <p className="text-gray-500 text-xs mt-2">No bids yet</p>
        )}
      </div>
    </div>
  )
}
