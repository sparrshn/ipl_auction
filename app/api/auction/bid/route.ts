import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const joinToken = request.headers.get('x-join-token')
    if (!joinToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roomCode, playerId, amount } = body

    if (!roomCode || !playerId || !amount) {
      return NextResponse.json({ error: 'roomCode, playerId, amount are required' }, { status: 400 })
    }

    const bidAmount = Number(amount)
    if (isNaN(bidAmount) || bidAmount <= 0) {
      return NextResponse.json({ error: 'Invalid bid amount' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Resolve team from join token
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', roomCode.toUpperCase())
      .single()

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Call the atomic place_bid RPC
    const { data: result, error: rpcError } = await supabase.rpc('place_bid', {
      p_room_id: room.id,
      p_player_id: playerId,
      p_team_id: team.id,
      p_amount: bidAmount,
    })

    if (rpcError) {
      console.error('place_bid RPC error:', rpcError)
      return NextResponse.json({ error: rpcError.message ?? 'Failed to place bid' }, { status: 500 })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, amount: result.amount })
  } catch (err) {
    console.error('POST /api/auction/bid error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
