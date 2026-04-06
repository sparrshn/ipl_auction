'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { Bid } from '../supabase/types'

export function useBids(roomId: string | null, playerId: string | null | undefined, limit = 20) {
  const [bids, setBids] = useState<Bid[]>([])

  useEffect(() => {
    if (!roomId) return

    // Clear immediately when player changes
    setBids([])

    if (!playerId) return

    async function fetchBids() {
      const { data } = await supabase
        .from('bids')
        .select('*, team:teams(id, name, color)')
        .eq('room_id', roomId)
        .eq('player_id', playerId)
        .order('placed_at', { ascending: false })
        .limit(limit)

      if (data) setBids(data as Bid[])
    }

    fetchBids()

    const channel = supabase
      .channel(`bids:${roomId}:${playerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await fetchBids()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, playerId, limit])

  return bids
}
