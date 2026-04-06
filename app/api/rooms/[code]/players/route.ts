import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { parseCsvText } from '@/lib/utils/csv-parser'
import { buildOrderedQueue } from '@/lib/utils/player-ordering'

async function getTeamFromToken(supabase: ReturnType<typeof createServerClient>, roomId: string, token: string) {
  const { data } = await supabase
    .from('teams')
    .select('*')
    .eq('room_id', roomId)
    .eq('join_token', token)
    .single()
  return data
}

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params
    const joinToken = request.headers.get('x-join-token')

    if (!joinToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()

    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const team = await getTeamFromToken(supabase, room.id, joinToken)
    if (!team || !team.is_admin) {
      return NextResponse.json({ error: 'Only admin can upload players' }, { status: 403 })
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Cannot upload players after auction starts' }, { status: 400 })
    }

    const body = await request.json()
    const { csvText } = body

    if (!csvText) {
      return NextResponse.json({ error: 'csvText is required' }, { status: 400 })
    }

    const { players, errors } = parseCsvText(csvText)

    if (players.length === 0) {
      return NextResponse.json({ error: 'No valid players found', details: errors }, { status: 400 })
    }

    // Delete existing players for this room
    await supabase.from('players').delete().eq('room_id', room.id)

    const finalOrdered = buildOrderedQueue(players)

    const toInsert = finalOrdered.map((p, i) => ({
      room_id: room.id,
      name: p.name,
      nationality: p.nationality,
      role: p.role,
      ipl_team: p.ipl_team,
      uncapped: p.uncapped ?? false,
      is_captain: p.is_captain ?? false,
      base_price: p.base_price,
      status: 'pending',
      queue_position: i + 1,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('players')
      .insert(toInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save players' }, { status: 500 })
    }

    return NextResponse.json({
      count: inserted?.length ?? 0,
      warnings: errors,
    })
  } catch (err) {
    console.error('POST /api/rooms/[code]/players error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
