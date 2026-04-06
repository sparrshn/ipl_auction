/**
 * Run with: npx tsx --env-file=.env.local scripts/test-accelerated.ts
 *
 * End-to-end test for the accelerated auction feature.
 * Creates a real test room in Supabase, runs through a mini auction,
 * marks some players unsold, triggers the accelerate route logic,
 * and verifies DB state. Cleans up after itself.
 */

import { createClient } from '@supabase/supabase-js'
import { buildOrderedQueue } from '../lib/utils/player-ordering'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

let passed = 0
let failed = 0
const roomId: string[] = [] // track for cleanup

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function cleanup(id: string) {
  await supabase.from('bids').delete().eq('room_id', id)
  await supabase.from('auction_state').delete().eq('room_id', id)
  await supabase.from('players').delete().eq('room_id', id)
  await supabase.from('teams').delete().eq('room_id', id)
  await supabase.from('rooms').delete().eq('id', id)
}

function randomCode() {
  return 'T' + Math.random().toString(36).substring(2, 7).toUpperCase()
}

// ── test ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nSetting up test room...')

  // 1. Create room
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({
      code: randomCode(),
      admin_password: 'test123',
      budget_per_team: 100_000_000,
      timer_duration: 30,
      status: 'waiting',
    })
    .select()
    .single()

  if (roomErr || !room) {
    console.error('Failed to create room:', roomErr)
    process.exit(1)
  }
  roomId.push(room.id)
  console.log(`  Room created: ${room.code} (${room.id})`)

  // 2. Create admin team
  const { data: adminTeam, error: teamErr } = await supabase
    .from('teams')
    .insert({
      room_id: room.id,
      name: 'Test Admin',
      color: '#ff0000',
      budget_remaining: 100_000_000,
      is_admin: true,
      join_token: 'admintok1234',
    })
    .select()
    .single()

  if (teamErr || !adminTeam) {
    console.error('Failed to create admin team:', teamErr)
    await cleanup(room.id)
    process.exit(1)
  }

  // 3. Insert 8 players: 3 Batsmen, 3 Bowlers, 2 All-Rounders
  const playerRows = [
    { name: 'Bat1', role: 'Batsman',     base_price: 1_000_000 },
    { name: 'Bat2', role: 'Batsman',     base_price: 1_000_000 },
    { name: 'Bat3', role: 'Batsman',     base_price: 1_000_000 },
    { name: 'Bwl1', role: 'Bowler',      base_price: 1_000_000 },
    { name: 'Bwl2', role: 'Bowler',      base_price: 1_000_000 },
    { name: 'Bwl3', role: 'Bowler',      base_price: 1_000_000 },
    { name: 'AR1',  role: 'All-Rounder', base_price: 1_000_000 },
    { name: 'AR2',  role: 'All-Rounder', base_price: 1_000_000 },
  ]

  const ordered = buildOrderedQueue(playerRows)
  const { data: players } = await supabase
    .from('players')
    .insert(
      ordered.map((p, i) => ({
        room_id: room.id,
        name: p.name,
        role: p.role,
        nationality: 'India',
        base_price: p.base_price,
        status: 'pending',
        queue_position: i + 1,
        uncapped: false,
        is_captain: false,
      }))
    )
    .select()

  assert((players?.length ?? 0) === 8, `8 players inserted (got ${players?.length})`)

  // 4. Create auction_state
  await supabase.from('auction_state').insert({
    room_id: room.id,
    current_player_id: null,
    current_bid_amount: 0,
    current_bid_team_id: null,
    timer_started_at: null,
    paused: false,
    paused_at: null,
  })

  // 5. Simulate auction: mark 5 as sold, 3 as unsold
  await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

  const soldNames  = ['Bat1', 'Bat2', 'Bwl1', 'Bwl2', 'AR1']
  const unsoldNames = ['Bat3', 'Bwl3', 'AR2']

  await Promise.all(soldNames.map(name =>
    supabase.from('players').update({
      status: 'sold',
      sold_to_team_id: adminTeam!.id,
      final_price: 1_000_000,
    }).eq('room_id', room.id).eq('name', name)
  ))

  await Promise.all(unsoldNames.map(name =>
    supabase.from('players').update({ status: 'unsold' })
      .eq('room_id', room.id).eq('name', name)
  ))

  await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)

  console.log('\nVerifying pre-accelerate state...')

  const { data: preSold }   = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'sold')
  const { data: preUnsold } = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'unsold')

  assert(preSold?.length === 5,   `5 sold players before accelerate (got ${preSold?.length})`)
  assert(preUnsold?.length === 3, `3 unsold players before accelerate (got ${preUnsold?.length})`)

  // 6. Run accelerate logic (mirrors the route)
  console.log('\nRunning accelerate logic...')

  const { data: unsoldPlayers } = await supabase
    .from('players').select('*')
    .eq('room_id', room.id).eq('status', 'unsold')

  const reOrdered = buildOrderedQueue(unsoldPlayers!)
  await Promise.all(
    reOrdered.map((p, i) =>
      supabase.from('players').update({ status: 'pending', queue_position: i + 1 }).eq('id', p.id)
    )
  )
  const firstPlayer = reOrdered[0]
  await supabase.from('players').update({ status: 'active' }).eq('id', firstPlayer.id)
  await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)
  await supabase.from('auction_state').update({
    current_player_id: firstPlayer.id,
    current_bid_amount: firstPlayer.base_price,
    current_bid_team_id: null,
    timer_started_at: new Date().toISOString(),
    paused: false,
    paused_at: null,
    updated_at: new Date().toISOString(),
  }).eq('room_id', room.id)

  // 7. Verify post-accelerate state
  console.log('\nVerifying post-accelerate state...')

  const { data: postRoom } = await supabase.from('rooms').select('status').eq('id', room.id).single()
  assert(postRoom?.status === 'active', `Room status is 'active' (got '${postRoom?.status}')`)

  const { data: postSold }    = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'sold')
  const { data: postPending } = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'pending')
  const { data: postActive }  = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'active')
  const { data: postUnsold }  = await supabase.from('players').select('*').eq('room_id', room.id).eq('status', 'unsold')

  assert(postSold?.length   === 5, `Sold players still 5 — untouched (got ${postSold?.length})`)
  assert(postPending?.length === 2, `2 pending players for round 2 (got ${postPending?.length})`)
  assert(postActive?.length  === 1, `1 active player (got ${postActive?.length})`)
  assert(postUnsold?.length  === 0, `0 unsold players remaining (got ${postUnsold?.length})`)

  // Sold names still correct
  const soldNamesPost = postSold?.map(p => p.name).sort() ?? []
  assert(
    JSON.stringify(soldNamesPost) === JSON.stringify([...soldNames].sort()),
    `Correct players still sold: ${soldNamesPost.join(', ')}`
  )

  // Queue positions are 1-based and sequential
  const allInQueue = [...(postPending ?? []), ...(postActive ?? [])]
    .sort((a, b) => a.queue_position - b.queue_position)
  const positions = allInQueue.map(p => p.queue_position)
  assert(
    JSON.stringify(positions) === JSON.stringify([1, 2, 3]),
    `Queue positions are sequential 1–3 (got ${positions.join(', ')})`
  )

  // Active player is queue_position 1
  assert(
    postActive?.[0]?.queue_position === 1,
    `Active player has queue_position 1 (got ${postActive?.[0]?.queue_position})`
  )

  // auction_state points to the active player
  const { data: state } = await supabase.from('auction_state').select('*').eq('room_id', room.id).single()
  assert(state?.current_player_id === postActive?.[0]?.id, 'auction_state points to the active player')
  assert(state?.current_bid_team_id === null, 'auction_state has no leading team')
  assert(state?.paused === false, 'auction_state is not paused')
  assert(state?.timer_started_at !== null, 'auction_state timer is running')

  // 8. Cleanup
  console.log('\nCleaning up...')
  await cleanup(room.id)
  console.log('  Cleaned up test room')

  // ── summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`)
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch(async (err) => {
  console.error('Unexpected error:', err)
  for (const id of roomId) await cleanup(id)
  process.exit(1)
})
