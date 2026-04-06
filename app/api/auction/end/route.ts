import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const joinToken = request.headers.get('x-join-token')
    if (!joinToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roomCode } = body

    if (!roomCode) {
      return NextResponse.json({ error: 'roomCode is required' }, { status: 400 })
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

    if (room.status !== 'active') {
      return NextResponse.json({ error: 'Auction is not active' }, { status: 400 })
    }

    const { data: adminTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!adminTeam || !adminTeam.is_admin) {
      return NextResponse.json({ error: 'Only admin can end the auction' }, { status: 403 })
    }

    // Mark any still-active player as unsold so data is clean
    await supabase
      .from('players')
      .update({ status: 'unsold' })
      .eq('room_id', room.id)
      .eq('status', 'active')

    // Finish the room
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)

    await supabase.from('auction_state').update({
      current_player_id: null,
      current_bid_amount: 0,
      current_bid_team_id: null,
      timer_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq('room_id', room.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/auction/end error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
