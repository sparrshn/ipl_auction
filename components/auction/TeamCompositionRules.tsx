'use client'

import type { Player } from '@/lib/supabase/types'

interface Rule {
  label: string
  short: string
  current: number
  required: number
}

interface Props {
  players: Player[]
  myTeamId: string | null
}

export function TeamCompositionRules({ players, myTeamId }: Props) {
  if (!myTeamId) return null

  const myPlayers = players.filter((p) => p.status === 'sold' && p.sold_to_team_id === myTeamId)

  const rules: Rule[] = [
    {
      label: 'Batsmen',
      short: 'BAT',
      current: myPlayers.filter((p) => p.role === 'Batsman').length,
      required: 4,
    },
    {
      label: 'Bowlers',
      short: 'BOWL',
      current: myPlayers.filter((p) => p.role === 'Bowler').length,
      required: 4,
    },
    {
      label: 'All-Rounder',
      short: 'AR',
      current: myPlayers.filter((p) => p.role === 'All-Rounder').length,
      required: 1,
    },
    {
      label: 'Captain',
      short: 'CPT',
      current: myPlayers.filter((p) => p.is_captain).length,
      required: 1,
    },
    {
      label: 'Uncapped',
      short: 'UC',
      current: myPlayers.filter((p) => p.uncapped).length,
      required: 1,
    },
  ]

  return (
    <div className="w-full max-w-md">
      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-1.5 text-center">
        Squad Requirements
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {rules.map((rule) => {
          const met = rule.current >= rule.required
          return (
            <div
              key={rule.label}
              className={`rounded-lg px-1 py-2 flex flex-col items-center gap-0.5 border transition-colors ${
                met
                  ? 'bg-green-900/40 border-green-600/50'
                  : 'bg-gray-900 border-gray-700'
              }`}
            >
              {met ? (
                <span className="text-green-400 text-xs font-black">✓</span>
              ) : (
                <span className="text-gray-500 text-xs font-black">{rule.short}</span>
              )}
              <span
                className={`text-base font-black tabular-nums leading-none ${
                  met ? 'text-green-400' : 'text-white'
                }`}
              >
                {rule.current}
              </span>
              <span className="text-[9px] text-gray-500 leading-none">
                min {rule.required}
              </span>
              <span className={`text-[9px] font-semibold leading-none ${met ? 'text-green-500' : 'text-gray-600'}`}>
                {rule.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
