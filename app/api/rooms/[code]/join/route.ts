import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateJoinToken } from '@/lib/utils/room-code'
import { OWNER_BUDGET, OWNERS, type Owner } from '@/lib/config/retentions'

const MAX_TEAMS = 5
const TEAM_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6']

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params
    const body = await request.json()
    const { teamName, adminPassword, owner } = body

    if (!teamName) {
      return NextResponse.json({ error: 'teamName is required' }, { status: 400 })
    }

    if (!owner || !OWNERS.includes(owner as Owner)) {
      return NextResponse.json({ error: 'owner must be one of: ' + OWNERS.join(', ') }, { status: 400 })
    }

    const supabase = createServerClient()

    // Get room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Auction has already started' }, { status: 400 })
    }

    // Get existing teams
    const { data: existingTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)

    const teams = existingTeams ?? []

    if (teams.length >= MAX_TEAMS) {
      return NextResponse.json({ error: 'Room is full (max 5 teams)' }, { status: 400 })
    }

    // Check name uniqueness
    if (teams.some((t) => t.name.toLowerCase() === teamName.toLowerCase())) {
      return NextResponse.json({ error: 'Team name already taken' }, { status: 400 })
    }

    // Determine if admin
    const isAdmin = !!adminPassword && adminPassword === room.admin_password

    // If claiming admin but already has an admin team
    if (isAdmin && teams.some((t) => t.is_admin)) {
      return NextResponse.json({ error: 'Admin team already exists' }, { status: 400 })
    }

    // Pick next color
    const usedColors = new Set(teams.map((t) => t.color))
    const color = TEAM_COLORS.find((c) => !usedColors.has(c)) ?? TEAM_COLORS[teams.length % TEAM_COLORS.length]

    // Check owner uniqueness in this room
    if (teams.some((t) => t.owner === owner)) {
      return NextResponse.json({ error: `${owner} has already joined this room` }, { status: 400 })
    }

    const joinToken = generateJoinToken()
    const budget = OWNER_BUDGET[owner as Owner]
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        room_id: room.id,
        name: teamName,
        owner,
        color,
        budget_remaining: budget,
        is_admin: isAdmin,
        join_token: joinToken,
      })
      .select()
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Failed to join room' }, { status: 500 })
    }

    return NextResponse.json({
      teamId: team.id,
      joinToken,
      isAdmin,
      roomId: room.id,
    })
  } catch (err) {
    console.error('POST /api/rooms/[code]/join error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
