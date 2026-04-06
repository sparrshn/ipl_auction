import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildOrderedQueue } from '@/lib/utils/player-ordering'

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

    if (room.status !== 'finished') {
      return NextResponse.json({ error: 'Accelerated auction can only start after the main auction finishes' }, { status: 400 })
    }

    const { data: adminTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!adminTeam || !adminTeam.is_admin) {
      return NextResponse.json({ error: 'Only admin can start the accelerated auction' }, { status: 403 })
    }

    // Fetch all unsold players
    const { data: unsoldPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'unsold')

    if (!unsoldPlayers || unsoldPlayers.length === 0) {
      return NextResponse.json({ error: 'No unsold players to re-auction' }, { status: 400 })
    }

    // Re-order unsold players with fresh shuffle
    const ordered = buildOrderedQueue(unsoldPlayers)

    // Reset all unsold players to pending with new queue positions
    await Promise.all(
      ordered.map((player, i) =>
        supabase
          .from('players')
          .update({ status: 'pending', queue_position: i + 1 })
          .eq('id', player.id)
      )
    )

    // Activate the first player
    const firstPlayer = ordered[0]
    await supabase.from('players').update({ status: 'active' }).eq('id', firstPlayer.id)

    // Reset room to active — triggers realtime navigation on all clients
    await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

    // Reset auction state
    await supabase.from('auction_state').update({
      current_player_id: firstPlayer.id,
      current_bid_amount: firstPlayer.base_price,
      current_bid_team_id: null,
      timer_started_at: new Date().toISOString(),
      paused: false,
      paused_at: null,
      updated_at: new Date().toISOString(),
    }).eq('room_id', room.id)

    return NextResponse.json({ success: true, playerId: firstPlayer.id })
  } catch (err) {
    console.error('POST /api/auction/accelerate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
