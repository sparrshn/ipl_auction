'use client'

import Image from 'next/image'
import { useState } from 'react'
import { formatPrice } from '@/lib/utils/currency'
import type { Team, Player, PlayerRole } from '@/lib/supabase/types'

const ROLE_STYLES: Record<PlayerRole, { bg: string; text: string; label: string }> = {
  'Batsman':       { bg: 'bg-blue-900/60',   text: 'text-blue-300',   label: 'BAT' },
  'Bowler':        { bg: 'bg-red-900/60',    text: 'text-red-300',    label: 'BOWL' },
  'All-Rounder':   { bg: 'bg-green-900/60',  text: 'text-green-300',  label: 'AR' },
  'Wicket-Keeper': { bg: 'bg-purple-900/60', text: 'text-purple-300', label: 'WK' },
}

const IPL_LOGO_URL = (team: string) =>
  `https://scores.iplt20.com/ipl/teamlogos/${team}.png`

function TeamLogo({ team }: { team: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="text-[10px] text-gray-400 font-bold">{team}</span>
  }
  return (
    <Image
      src={IPL_LOGO_URL(team)}
      alt={team}
      width={36}
      height={36}
      className="object-contain"
      onError={() => setFailed(true)}
      unoptimized
    />
  )
}

function PlaneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-3.5 h-3.5 text-yellow-400 inline-block ml-0.5 -translate-y-px rotate-45"
    >
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  )
}

interface Props {
  teams: Team[]
  players: Player[]
  myTeamId: string | null
}

export function SquadDisplay({ teams, players, myTeamId }: Props) {
  const soldPlayers = players.filter((p) => p.status === 'sold')

  const myTeam = teams.find((t) => t.id === myTeamId)
  if (!myTeam) return null

  const myPlayers = soldPlayers.filter((p) => p.sold_to_team_id === myTeamId)

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider">My Squad</h3>
        <span className="text-sm font-black text-white tabular-nums ml-auto">
          {myPlayers.length}<span className="text-gray-600 font-normal">/16</span>
        </span>
      </div>
      {myPlayers.length === 0 && (
        <p className="text-xs text-gray-600 px-0.5">No players yet</p>
      )}
      <div className="space-y-1.5">
        {myPlayers.map((p) => {
          const role = p.role ?? 'Batsman'
          const style = ROLE_STYLES[role] ?? ROLE_STYLES['Batsman']
          const isForeign = p.nationality && p.nationality.toLowerCase() !== 'india'
          return (
            <div
              key={p.id}
              className={`rounded-lg px-3 py-2 ${style.bg} flex items-center gap-2`}
            >
              {p.ipl_team && (
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
                  <TeamLogo team={p.ipl_team} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">
                  {p.name}
                  {isForeign && <PlaneIcon />}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{formatPrice(p.final_price ?? 0)}</p>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${style.text}`}>
                {style.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
