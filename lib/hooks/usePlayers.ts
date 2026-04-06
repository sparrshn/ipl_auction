'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { Player } from '../supabase/types'

export function usePlayers(roomId: string | null) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    async function fetchPlayers() {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('queue_position')

      if (data) setPlayers(data)
      setLoading(false)
    }

    fetchPlayers()

    const channel = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlayers()
        }
      )
      .subscribe()

    const pollInterval = setInterval(fetchPlayers, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [roomId])

  return { players, loading }
}
