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

    const { data: adminTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!adminTeam || !adminTeam.is_admin) {
      return NextResponse.json({ error: 'Only admin can advance to next player' }, { status: 403 })
    }

    // Get current state
    const { data: state } = await supabase
      .from('auction_state')
      .select('*')
      .eq('room_id', room.id)
      .single()

    if (!state) {
      return NextResponse.json({ error: 'Auction state not found' }, { status: 400 })
    }

    // Verify current player is resolved
    if (state.current_player_id) {
      const { data: currentPlayer } = await supabase
        .from('players')
        .select('status')
        .eq('id', state.current_player_id)
        .single()

      if (currentPlayer && currentPlayer.status === 'active') {
        return NextResponse.json({ error: 'Current player must be resolved first (sold or unsold)' }, { status: 400 })
      }
    }

    // Find next pending player
    const { data: nextPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'pending')
      .order('queue_position')
      .limit(1)
      .single()

    if (!nextPlayer) {
      // No more players — auction finished
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)
      await supabase.from('auction_state').update({
        current_player_id: null,
        current_bid_amount: 0,
        current_bid_team_id: null,
        timer_started_at: null,
        updated_at: new Date().toISOString(),
      }).eq('room_id', room.id)

      return NextResponse.json({ success: true, finished: true })
    }

    // Activate next player
    await supabase.from('players').update({ status: 'active' }).eq('id', nextPlayer.id)

    await supabase.from('auction_state').update({
      current_player_id: nextPlayer.id,
      current_bid_amount: nextPlayer.base_price,
      current_bid_team_id: null,
      timer_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('room_id', room.id)

    return NextResponse.json({ success: true, finished: false, playerId: nextPlayer.id })
  } catch (err) {
    console.error('POST /api/auction/next error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
