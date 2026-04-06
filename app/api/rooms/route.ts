import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateRoomCode, generateJoinToken } from '@/lib/utils/room-code'
import { OWNER_BUDGET, OWNERS, type Owner } from '@/lib/config/retentions'

const DEFAULT_TIMER = 30 // seconds
const TEAM_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6']

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { adminPassword, adminTeamName, adminOwner } = body

    if (!adminPassword || !adminTeamName || !adminOwner) {
      return NextResponse.json(
        { error: 'adminPassword, adminTeamName and adminOwner are required' },
        { status: 400 }
      )
    }

    if (!OWNERS.includes(adminOwner as Owner)) {
      return NextResponse.json({ error: 'Invalid owner name' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Generate unique room code
    let code = generateRoomCode()
    let attempts = 0
    while (attempts < 10) {
      const { data } = await supabase.from('rooms').select('code').eq('code', code).single()
      if (!data) break
      code = generateRoomCode()
      attempts++
    }

    // Create room (budget_per_team is the max, used as fallback; per-team budgets come from OWNER_BUDGET)
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code,
        admin_password: adminPassword,
        budget_per_team: 1_000_000_000, // 100Cr default, overridden per team
        timer_duration: DEFAULT_TIMER,
        status: 'waiting',
      })
      .select()
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    // Create admin team with owner-based budget
    const joinToken = generateJoinToken()
    const budget = OWNER_BUDGET[adminOwner as Owner]
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        room_id: room.id,
        name: adminTeamName,
        owner: adminOwner,
        color: TEAM_COLORS[0],
        budget_remaining: budget,
        is_admin: true,
        join_token: joinToken,
      })
      .select()
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Failed to create admin team' }, { status: 500 })
    }

    // Create auction_state row
    await supabase.from('auction_state').insert({
      room_id: room.id,
      current_bid_amount: 0,
    })

    return NextResponse.json({
      roomCode: code,
      teamId: team.id,
      joinToken,
      isAdmin: true,
    })
  } catch (err) {
    console.error('POST /api/rooms error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
