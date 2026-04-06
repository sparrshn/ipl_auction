'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { Team } from '../supabase/types'

export function useTeams(roomId: string | null) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    async function fetchTeams() {
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at')

      if (data) setTeams(data)
      setLoading(false)
    }

    fetchTeams()

    const channel = supabase
      .channel(`teams:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchTeams()
        }
      )
      .subscribe()

    const pollInterval = setInterval(fetchTeams, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [roomId])

  return { teams, loading }
}
