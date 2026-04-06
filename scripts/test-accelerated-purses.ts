/**
 * Run with: npx tsx --env-file=.env.local scripts/test-accelerated-purses.ts
 *
 * Verifies that after an accelerated auction is triggered:
 *  - Each team's budget_remaining is exactly as left after round 1 (no reset)
 *  - Sold players still point to the correct team with the correct final_price
 *  - Unsold/re-queued players have sold_to_team_id = null and final_price = null
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
const createdRooms: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

async function cleanup(id: string) {
  await supabase.from('bids').delete().eq('room_id', id)
  await supabase.from('auction_state').delete().eq('room_id', id)
  await supabase.from('players').delete().eq('room_id', id)
  await supabase.from('teams').delete().eq('room_id', id)
  await supabase.from('rooms').delete().eq('id', id)
}

function randomCode() {
  return 'P' + Math.random().toString(36).substring(2, 7).toUpperCase()
}

async function run() {
  console.log('\nSetting up test room with 3 teams...')

  // ── 1. Create room ────────────────────────────────────────────────────────
  const BUDGET = 100_000_000
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({
      code: randomCode(),
      admin_password: 'test123',
      budget_per_team: BUDGET,
      timer_duration: 30,
      status: 'waiting',
    })
    .select()
    .single()

  if (roomErr || !room) {
    console.error('Failed to create room:', roomErr)
    process.exit(1)
  }
  createdRooms.push(room.id)
  console.log(`  Room: ${room.code} (${room.id})`)

  // ── 2. Create 3 teams ─────────────────────────────────────────────────────
  const teamSeeds = [
    { name: 'Alpha',   color: '#ff0000', join_token: 'alphatoken1', is_admin: true  },
    { name: 'Bravo',   color: '#00ff00', join_token: 'bravotoken1', is_admin: false },
    { name: 'Charlie', color: '#0000ff', join_token: 'charlietok1', is_admin: false },
  ]

  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .insert(teamSeeds.map(t => ({ room_id: room.id, budget_remaining: BUDGET, ...t })))
    .select()

  if (teamsErr || !teams || teams.length !== 3) {
    console.error('Failed to create teams:', teamsErr)
    await cleanup(room.id)
    process.exit(1)
  }
  const [alpha, bravo, charlie] = teams
  console.log(`  Teams: ${teams.map(t => t.name).join(', ')}`)

  // ── 3. Insert 9 players (3 per role) ─────────────────────────────────────
  const playerRows = [
    { name: 'Bat1', role: 'Batsman',     base_price: 1_000_000 },
    { name: 'Bat2', role: 'Batsman',     base_price: 2_000_000 },
    { name: 'Bat3', role: 'Batsman',     base_price: 3_000_000 },
    { name: 'Bwl1', role: 'Bowler',      base_price: 1_000_000 },
    { name: 'Bwl2', role: 'Bowler',      base_price: 2_000_000 },
    { name: 'Bwl3', role: 'Bowler',      base_price: 3_000_000 },
    { name: 'AR1',  role: 'All-Rounder', base_price: 1_000_000 },
    { name: 'AR2',  role: 'All-Rounder', base_price: 2_000_000 },
    { name: 'AR3',  role: 'All-Rounder', base_price: 3_000_000 },
  ]

  const ordered = buildOrderedQueue(playerRows)
  const { data: players, error: playersErr } = await supabase
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

  if (playersErr || !players || players.length !== 9) {
    console.error('Failed to insert players:', playersErr)
    await cleanup(room.id)
    process.exit(1)
  }

  // ── 4. Create auction_state ───────────────────────────────────────────────
  await supabase.from('auction_state').insert({
    room_id: room.id,
    current_player_id: null,
    current_bid_amount: 0,
    current_bid_team_id: null,
    timer_started_at: null,
    paused: false,
    paused_at: null,
  })
  await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

  // ── 5. Simulate round 1 purchases ────────────────────────────────────────
  //
  //  Alpha   buys Bat1 @ 5M  and Bwl1 @ 4M   → spent 9M  → remaining 91M
  //  Bravo   buys Bat2 @ 8M  and AR1  @ 6M   → spent 14M → remaining 86M
  //  Charlie buys Bwl2 @ 7M                  → spent 7M  → remaining 93M
  //  Unsold: Bat3, Bwl3, AR2, AR3

  const purchases: { playerName: string; team: typeof alpha; price: number }[] = [
    { playerName: 'Bat1', team: alpha,   price: 5_000_000 },
    { playerName: 'Bwl1', team: alpha,   price: 4_000_000 },
    { playerName: 'Bat2', team: bravo,   price: 8_000_000 },
    { playerName: 'AR1',  team: bravo,   price: 6_000_000 },
    { playerName: 'Bwl2', team: charlie, price: 7_000_000 },
  ]
  const unsoldNames = ['Bat3', 'Bwl3', 'AR2', 'AR3']

  // Apply purchases: update player + deduct budget
  for (const { playerName, team, price } of purchases) {
    const player = players.find(p => p.name === playerName)!
    await supabase.from('players').update({
      status: 'sold',
      sold_to_team_id: team.id,
      final_price: price,
    }).eq('id', player.id)

    await supabase.from('teams').update({
      budget_remaining: BUDGET - purchases
        .filter(x => x.team.id === team.id)
        .reduce((s, x) => s + x.price, 0),
    }).eq('id', team.id)
  }

  // Mark unsold
  for (const name of unsoldNames) {
    const player = players.find(p => p.name === name)!
    await supabase.from('players').update({ status: 'unsold' }).eq('id', player.id)
  }

  await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)

  // ── 6. Snapshot expected state post-round-1 ───────────────────────────────
  const { data: teamsAfterR1 } = await supabase
    .from('teams').select('*').eq('room_id', room.id)

  const expectedBudgets: Record<string, number> = {}
  for (const t of teamsAfterR1 ?? []) {
    expectedBudgets[t.id] = t.budget_remaining
  }

  const expectedAlpha   = BUDGET - 5_000_000 - 4_000_000   // 91M
  const expectedBravo   = BUDGET - 8_000_000 - 6_000_000   // 86M
  const expectedCharlie = BUDGET - 7_000_000                // 93M

  console.log('\nVerifying round-1 budgets...')
  assert(expectedBudgets[alpha.id]   === expectedAlpha,   `Alpha budget after R1: ${expectedBudgets[alpha.id] / 1e6}M (expected ${expectedAlpha / 1e6}M)`)
  assert(expectedBudgets[bravo.id]   === expectedBravo,   `Bravo budget after R1: ${expectedBudgets[bravo.id] / 1e6}M (expected ${expectedBravo / 1e6}M)`)
  assert(expectedBudgets[charlie.id] === expectedCharlie, `Charlie budget after R1: ${expectedBudgets[charlie.id] / 1e6}M (expected ${expectedCharlie / 1e6}M)`)

  // ── 7. Run accelerate logic (mirrors route) ───────────────────────────────
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

  // ── 8. Verify purses are unchanged ────────────────────────────────────────
  console.log('\nVerifying team purses are intact after accelerate...')

  const { data: teamsAfterAccel } = await supabase
    .from('teams').select('*').eq('room_id', room.id)

  for (const t of teamsAfterAccel ?? []) {
    assert(
      t.budget_remaining === expectedBudgets[t.id],
      `${t.name} budget_remaining unchanged: ${t.budget_remaining / 1e6}M`
    )
  }

  // ── 9. Verify sold players are untouched ─────────────────────────────────
  console.log('\nVerifying sold player assignments are intact...')

  const { data: soldPlayers } = await supabase
    .from('players').select('*').eq('room_id', room.id).eq('status', 'sold')

  assert(soldPlayers?.length === 5, `5 sold players still present (got ${soldPlayers?.length})`)

  for (const { playerName, team, price } of purchases) {
    const p = soldPlayers?.find(x => x.name === playerName)
    assert(p !== undefined,              `${playerName} is still in sold list`)
    assert(p?.sold_to_team_id === team.id, `${playerName} still owned by ${team.name}`)
    assert(p?.final_price === price,     `${playerName} final_price still ${price / 1e6}M`)
  }

  // ── 10. Verify unsold players are now pending/active with no team ─────────
  console.log('\nVerifying re-queued players have no team assignment...')

  const { data: reQueued } = await supabase
    .from('players').select('*').eq('room_id', room.id)
    .in('status', ['pending', 'active'])

  assert(reQueued?.length === 4, `4 re-queued players (got ${reQueued?.length})`)

  for (const p of reQueued ?? []) {
    assert(p.sold_to_team_id === null, `${p.name} sold_to_team_id is null`)
    assert(p.final_price === null,     `${p.name} final_price is null`)
    assert(unsoldNames.includes(p.name), `${p.name} is one of the original unsold players`)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\nCleaning up...')
  await cleanup(room.id)
  console.log('  Cleaned up test room')

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch(async (err) => {
  console.error('Unexpected error:', err)
  for (const id of createdRooms) await cleanup(id)
  process.exit(1)
})
