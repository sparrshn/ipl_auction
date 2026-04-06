import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const joinToken = request.headers.get('x-join-token')
    if (!joinToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roomCode, resolution } = body // resolution: 'sold' | 'unsold'

    if (!roomCode || !['sold', 'unsold'].includes(resolution)) {
      return NextResponse.json({ error: 'roomCode and resolution (sold|unsold) are required' }, { status: 400 })
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
      return NextResponse.json({ error: 'Only admin can resolve bids' }, { status: 403 })
    }

    // Get current auction state
    const { data: state } = await supabase
      .from('auction_state')
      .select('*')
      .eq('room_id', room.id)
      .single()

    if (!state || !state.current_player_id) {
      return NextResponse.json({ error: 'No active player' }, { status: 400 })
    }

    if (resolution === 'sold') {
      if (!state.current_bid_team_id) {
        return NextResponse.json({ error: 'No bids placed — use unsold instead' }, { status: 400 })
      }

      // Update player as sold
      await supabase.from('players').update({
        status: 'sold',
        sold_to_team_id: state.current_bid_team_id,
        final_price: state.current_bid_amount,
      }).eq('id', state.current_player_id)

      // Deduct budget from winning team
      const { data: winningTeam } = await supabase
        .from('teams')
        .select('budget_remaining')
        .eq('id', state.current_bid_team_id)
        .single()

      if (winningTeam) {
        await supabase.from('teams').update({
          budget_remaining: winningTeam.budget_remaining - state.current_bid_amount,
        }).eq('id', state.current_bid_team_id)
      }
    } else {
      // Unsold
      await supabase.from('players').update({ status: 'unsold' }).eq('id', state.current_player_id)
    }

    // Stop the timer for all clients
    await supabase.from('auction_state').update({
      timer_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq('room_id', room.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/auction/resolve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
