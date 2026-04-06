'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { Room } from '../supabase/types'

export function useRoom(code: string | null) {
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!code) return

    async function fetchRoom() {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single()

      if (data) setRoom(data)
      setLoading(false)
    }

    fetchRoom()

    const channel = supabase
      .channel(`room:${code}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${code}`,
        },
        (payload) => {
          setRoom(payload.new as Room)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [code])

  return { room, loading }
}
