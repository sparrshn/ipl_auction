import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const joinToken = request.headers.get('x-join-token')
    if (!joinToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roomCode, action } = body // action: 'pause' | 'unpause'

    if (!roomCode || !['pause', 'unpause'].includes(action)) {
      return NextResponse.json({ error: 'roomCode and action (pause|unpause) are required' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode.toUpperCase())
      .single()

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const { data: adminTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!adminTeam || !adminTeam.is_admin) {
      return NextResponse.json({ error: 'Only admin can pause/unpause' }, { status: 403 })
    }

    const { data: state } = await supabase
      .from('auction_state')
      .select('*')
      .eq('room_id', room.id)
      .single()

    if (!state) {
      return NextResponse.json({ error: 'Auction state not found' }, { status: 400 })
    }

    if (action === 'pause') {
      if (state.paused) {
        return NextResponse.json({ error: 'Already paused' }, { status: 400 })
      }
      await supabase.from('auction_state').update({
        paused: true,
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('room_id', room.id)
    } else {
      if (!state.paused) {
        return NextResponse.json({ error: 'Not paused' }, { status: 400 })
      }
      // Adjust timer_started_at so remaining time is preserved
      // new_start = NOW() - elapsed_before_pause
      // elapsed_before_pause = paused_at - timer_started_at
      const now = new Date()
      const pausedAt = new Date(state.paused_at!)
      const timerStartedAt = new Date(state.timer_started_at!)
      const elapsedMs = pausedAt.getTime() - timerStartedAt.getTime()
      const newTimerStartedAt = new Date(now.getTime() - elapsedMs)

      await supabase.from('auction_state').update({
        paused: false,
        paused_at: null,
        timer_started_at: newTimerStartedAt.toISOString(),
        updated_at: now.toISOString(),
      }).eq('room_id', room.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/auction/pause error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
