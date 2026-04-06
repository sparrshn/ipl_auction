import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
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

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('room_id', room.id)
      .eq('join_token', joinToken)
      .single()

    if (!team || !team.is_admin) {
      return NextResponse.json({ error: 'Only admin can change settings' }, { status: 403 })
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Cannot change settings after auction starts' }, { status: 400 })
    }

    const body = await request.json()
    const { budgetPerTeam, timerDuration } = body

    const updates: Record<string, unknown> = {}
    if (budgetPerTeam !== undefined) {
      const budget = Number(budgetPerTeam)
      if (isNaN(budget) || budget < 10_000_000) {
        return NextResponse.json({ error: 'Budget must be at least 1 Cr' }, { status: 400 })
      }
      updates.budget_per_team = budget
    }
    if (timerDuration !== undefined) {
      const timer = Number(timerDuration)
      if (isNaN(timer) || timer < 10 || timer > 120) {
        return NextResponse.json({ error: 'Timer must be 10–120 seconds' }, { status: 400 })
      }
      updates.timer_duration = timer
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase.from('rooms').update(updates).eq('id', room.id)
    if (error) {
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    // If budget changed, update all team budgets
    if (updates.budget_per_team) {
      await supabase
        .from('teams')
        .update({ budget_remaining: updates.budget_per_team })
        .eq('room_id', room.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('PATCH /api/rooms/[code]/settings error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
