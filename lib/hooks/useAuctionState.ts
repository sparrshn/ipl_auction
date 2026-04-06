'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase/client'
import type { AuctionState, Player } from '../supabase/types'

export function useAuctionState(roomId: string | null) {
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const auctionStateRef = useRef<AuctionState | null>(null)

  useEffect(() => {
    if (!roomId) return

    async function fetchPlayer(playerId: string) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single()
      if (data) setCurrentPlayer(data)
    }

    async function fetchState() {
      const { data } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single()

      if (data) {
        // Only update if state actually changed (avoid unnecessary re-renders)
        if (JSON.stringify(data) !== JSON.stringify(auctionStateRef.current)) {
          auctionStateRef.current = data
          setAuctionState(data)
          if (data.current_player_id) {
            fetchPlayer(data.current_player_id)
          } else {
            setCurrentPlayer(null)
          }
        }
      }
      setLoading(false)
    }

    fetchState()

    // Realtime subscription — primary update path
    const channel = supabase
      .channel(`auction_state:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auction_state',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newState = payload.new as AuctionState
          auctionStateRef.current = newState
          setAuctionState(newState)
          if (newState.current_player_id) {
            await fetchPlayer(newState.current_player_id)
          } else {
            setCurrentPlayer(null)
          }
        }
      )
      .subscribe()

    // Polling fallback — catches missed realtime events (e.g. brief disconnects)
    const pollInterval = setInterval(fetchState, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [roomId])

  return { auctionState, currentPlayer, loading }
}
