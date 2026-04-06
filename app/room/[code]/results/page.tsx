'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getSession } from '@/lib/session'
import { useRoom } from '@/lib/hooks/useRoom'
import { formatPrice } from '@/lib/utils/currency'
import type { Team, Player } from '@/lib/supabase/types'
import { computeAuctionStats } from '@/lib/utils/auction-stats'
import type { BidRef } from '@/lib/utils/auction-stats'

interface TeamWithPlayers extends Team {
  players: Player[]
  totalSpent: number
}

export default function ResultsPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()
  const router = useRouter()

  const [session, setSession] = useState<{ teamId: string; joinToken: string; isAdmin: boolean } | null>(null)
  const [teamsData, setTeamsData] = useState<TeamWithPlayers[]>([])
  const [unsoldCount, setUnsoldCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [accelerating, setAccelerating] = useState(false)
  const [accelerateError, setAccelerateError] = useState('')
  const [bids, setBids] = useState<BidRef[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [soldPlayers, setSoldPlayers] = useState<Player[]>([])

  const { room } = useRoom(code)

  // Load session
  useEffect(() => {
    setSession(getSession(code))
  }, [code])

  // Auto-navigate back to auction when accelerated round starts
  useEffect(() => {
    if (room?.status === 'active') {
      router.push(`/room/${code}/auction`)
    }
  }, [room?.status, code, router])

  useEffect(() => {
    async function load() {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', code)
        .single()

      if (!roomData) return

      const [{ data: teams }, { data: players }, { data: unsold }, { data: fetchedAllPlayers }, { data: fetchedBids }] = await Promise.all([
        supabase.from('teams').select('*').eq('room_id', roomData.id).order('budget_remaining'),
        supabase.from('players').select('*').eq('room_id', roomData.id).eq('status', 'sold').order('final_price', { ascending: false }),
        supabase.from('players').select('id').eq('room_id', roomData.id).eq('status', 'unsold'),
        supabase.from('players').select('*').eq('room_id', roomData.id),
        supabase.from('bids').select('player_id, team_id').eq('room_id', roomData.id),
      ])

      if (!teams) return

      const result: TeamWithPlayers[] = teams.map((t) => {
        const teamPlayers = (players ?? []).filter((p) => p.sold_to_team_id === t.id)
        const totalSpent = teamPlayers.reduce((sum, p) => sum + (p.final_price ?? 0), 0)
        return { ...t, players: teamPlayers, totalSpent }
      })

      result.sort((a, b) => b.players.length - a.players.length || b.totalSpent - a.totalSpent)
      setTeamsData(result)
      setUnsoldCount(unsold?.length ?? 0)
      setSoldPlayers(players ?? [])
      setAllPlayers(fetchedAllPlayers ?? [])
      setBids(fetchedBids ?? [])
      setLoading(false)
    }
    load()
  }, [code])

  async function handleStartAccelerated() {
    if (!session) return
    setAccelerating(true)
    setAccelerateError('')
    const res = await fetch('/api/auction/accelerate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session.joinToken,
      },
      body: JSON.stringify({ roomCode: code }),
    })
    const data = await res.json()
    if (!res.ok) {
      setAccelerateError(data.error ?? 'Failed to start accelerated auction')
      setAccelerating(false)
    }
    // On success: do nothing — realtime room.status update navigates all clients
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Loading results...</p>
      </div>
    )
  }

  const selectedTeam = teamsData.find((t) => t.id === selected)
  const stats = computeAuctionStats(teamsData, soldPlayers, allPlayers, bids)

  return (
    <div className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-yellow-400">Auction Results</h1>
          <p className="text-gray-400 mt-1">Room: <span className="font-mono font-bold">{code}</span></p>
        </div>

        {/* Accelerated auction banner */}
        {unsoldCount > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-yellow-600/50 p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-yellow-400 font-black text-lg">
                {unsoldCount} Unsold Player{unsoldCount !== 1 ? 's' : ''}
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                Start a second round to re-auction unsold players. Budgets and squads carry over.
              </p>
              {accelerateError && <p className="text-red-400 text-sm mt-1">{accelerateError}</p>}
            </div>
            {session?.isAdmin ? (
              <button
                onClick={handleStartAccelerated}
                disabled={accelerating}
                className="shrink-0 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black py-2.5 px-6 rounded-xl transition-colors"
              >
                {accelerating ? 'Starting...' : 'Start Accelerated Auction'}
              </button>
            ) : (
              <p className="text-gray-500 text-sm italic shrink-0">Waiting for admin to start...</p>
            )}
          </div>
        )}

        {/* Standings table */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-8 overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs text-gray-400 font-bold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 font-bold uppercase">Team</th>
                <th className="px-4 py-3 text-right text-xs text-gray-400 font-bold uppercase">Players</th>
                <th className="px-4 py-3 text-right text-xs text-gray-400 font-bold uppercase">Spent</th>
                <th className="px-4 py-3 text-right text-xs text-gray-400 font-bold uppercase">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {teamsData.map((team, i) => (
                <tr
                  key={team.id}
                  onClick={() => setSelected(selected === team.id ? null : team.id)}
                  className="border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                      <span className="font-bold" style={{ color: team.color }}>{team.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-white">{team.players.length}</td>
                  <td className="px-4 py-3 text-right text-yellow-400 font-semibold">
                    {formatPrice(team.totalSpent)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-400 font-semibold">
                    {formatPrice(team.budget_remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Auction Stats */}
        {stats.length > 0 && (
          <section>
            <h2 className="text-2xl font-black text-white mb-4">Auction Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
              {stats.map(stat => (
                <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-2xl mb-1">{stat.emoji}</div>
                  <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{stat.label}</div>
                  <div className="text-white font-black text-sm leading-tight">{stat.value}</div>
                  <div className="text-gray-500 text-xs mt-1">{stat.sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Squad detail (expandable) */}
        {selectedTeam && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-xl font-black mb-4" style={{ color: selectedTeam.color }}>
              {selectedTeam.name} — Squad ({selectedTeam.players.length} players)
            </h2>
            {selectedTeam.players.length === 0 ? (
              <p className="text-gray-500">No players acquired</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {selectedTeam.players.map((p) => (
                  <div key={p.id} className="bg-gray-800 rounded-xl p-3">
                    <p className="font-bold text-white">{p.name}</p>
                    {p.nationality && <p className="text-xs text-gray-400">{p.nationality}</p>}
                    {p.role && (
                      <span className="text-xs bg-gray-700 px-2 py-0.5 rounded mt-1 inline-block text-gray-300">
                        {p.role}
                      </span>
                    )}
                    <p className="text-yellow-400 font-bold mt-2">{formatPrice(p.final_price ?? 0)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-gray-600 text-sm mt-8">Click a team to view their squad</p>
      </div>
    </div>
  )
}
