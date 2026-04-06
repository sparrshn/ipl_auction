import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { OWNER_RETENTIONS, type Owner } from '@/lib/config/retentions'

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

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Auction already started' }, { status: 400 })
    }

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!team || !team.is_admin) {
      return NextResponse.json({ error: 'Only admin can start the auction' }, { status: 403 })
    }

    // Resolve retentions: mark retained players as sold before auction starts
    const { data: allTeams } = await supabase
      .from('teams')
      .select('id, owner, budget_remaining')
      .eq('room_id', room.id)

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, name, status')
      .eq('room_id', room.id)

    if (allTeams && allPlayers) {
      for (const team of allTeams) {
        if (!team.owner) continue
        const retentions = OWNER_RETENTIONS[team.owner as Owner] ?? []
        for (const retention of retentions) {
          const player = allPlayers.find(
            (p) => p.name.toLowerCase() === retention.playerName.toLowerCase() && p.status === 'pending'
          )
          if (!player) continue
          await supabase
            .from('players')
            .update({
              status: 'sold',
              sold_to_team_id: team.id,
              final_price: retention.price,
              queue_position: 0, // sink retentions to bottom of auction log
              ...(retention.is_captain ? { is_captain: true } : {}),
            })
            .eq('id', player.id)
        }
      }
    }

    // Get first player
    const { data: firstPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'pending')
      .order('queue_position')
      .limit(1)
      .single()

    if (!firstPlayer) {
      return NextResponse.json({ error: 'No players uploaded yet' }, { status: 400 })
    }

    // Update room status to active
    await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

    // Set first player as active
    await supabase.from('players').update({ status: 'active' }).eq('id', firstPlayer.id)

    // Update auction state
    await supabase.from('auction_state').update({
      current_player_id: firstPlayer.id,
      current_bid_amount: firstPlayer.base_price,
      current_bid_team_id: null,
      timer_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('room_id', room.id)

    return NextResponse.json({ success: true, playerId: firstPlayer.id })
  } catch (err) {
    console.error('POST /api/auction/start error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
