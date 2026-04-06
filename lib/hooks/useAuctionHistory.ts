'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { Player, Team } from '../supabase/types'

export interface AuctionHistoryEntry {
  player: Player
  team: Team | null // null = unsold
}

export function useAuctionHistory(roomId: string | null) {
  const [history, setHistory] = useState<AuctionHistoryEntry[]>([])

  useEffect(() => {
    if (!roomId) return

    async function fetchHistory() {
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['sold', 'unsold'])
        .order('queue_position', { ascending: false })

      if (!players) return

      const teamIds = Array.from(new Set(players.map((p) => p.sold_to_team_id).filter(Boolean)))
      let teamsMap: Record<string, Team> = {}

      if (teamIds.length > 0) {
        const { data: teams } = await supabase
          .from('teams')
          .select('*')
          .in('id', teamIds)
        if (teams) {
          teamsMap = Object.fromEntries(teams.map((t) => [t.id, t]))
        }
      }

      setHistory(
        players.map((p) => ({
          player: p,
          team: p.sold_to_team_id ? (teamsMap[p.sold_to_team_id] ?? null) : null,
        }))
      )
    }

    fetchHistory()

    const channel = supabase
      .channel(`auction_history:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchHistory()
        }
      )
      .subscribe()

    const pollInterval = setInterval(fetchHistory, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [roomId])

  return history
}
