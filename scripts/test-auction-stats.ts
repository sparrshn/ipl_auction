/**
 * Run with: npx tsx scripts/test-auction-stats.ts
 * Tests every stat card produced by computeAuctionStats.
 */

import { computeAuctionStats } from '../lib/utils/auction-stats'
import type { StatCard } from '../lib/utils/auction-stats'
import type { Team, Player } from '../lib/supabase/types'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

function find(stats: StatCard[], label: string): StatCard | undefined {
  return stats.find(s => s.label === label)
}

function assertStat(stats: StatCard[], label: string, value: string, subContains?: string) {
  const s = find(stats, label)
  if (!s) {
    console.error(`  ✗ FAIL: "${label}" stat missing`)
    failed++
    return
  }
  assert(s.value === value, `${label} value: "${s.value}" (want "${value}")`)
  if (subContains !== undefined) {
    assert(s.sub.includes(subContains), `${label} sub contains "${subContains}" (got "${s.sub}")`)
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const T = (id: string, name: string, budget_remaining: number): Team => ({
  id, name, color: '#fff', budget_remaining, is_admin: false,
  join_token: id, room_id: 'room1', created_at: '2024-01-01',
})

const P = (
  id: string,
  name: string,
  opts: {
    role?: Player['role']
    nationality?: string
    base_price?: number
    final_price?: number
    sold_to?: string
    queue_position?: number
    status?: Player['status']
    uncapped?: boolean
  } = {}
): Player => ({
  id, name,
  room_id: 'room1',
  role: opts.role ?? 'Batsman',
  nationality: opts.nationality ?? 'India',
  ipl_team: null,
  uncapped: opts.uncapped ?? false,
  is_captain: false,
  base_price: opts.base_price ?? 1_000_000,
  status: opts.status ?? 'sold',
  sold_to_team_id: opts.sold_to ?? null,
  final_price: opts.final_price ?? null,
  queue_position: opts.queue_position ?? 1,
  created_at: '2024-01-01',
})

const B = (player_id: string, team_id: string) => ({ player_id, team_id })

// ── Teams & Players ───────────────────────────────────────────────────────────

const alpha   = T('t1', 'Alpha',   50_000_000)
const bravo   = T('t2', 'Bravo',   80_000_000)
const charlie = T('t3', 'Charlie', 30_000_000)
const teams   = [alpha, bravo, charlie]

// Sold players (auctioned, queue_position > 0)
const p1 = P('p1', 'Virat',   { role: 'Batsman',     final_price: 20_000_000, sold_to: 't1', queue_position: 1,  base_price: 2_000_000,  nationality: 'India' })
const p2 = P('p2', 'Bumrah',  { role: 'Bowler',      final_price: 15_000_000, sold_to: 't2', queue_position: 2,  base_price: 2_000_000,  nationality: 'India' })
const p3 = P('p3', 'Stokes',  { role: 'All-Rounder', final_price: 18_000_000, sold_to: 't3', queue_position: 3,  base_price: 1_000_000,  nationality: 'England',  uncapped: false })
const p4 = P('p4', 'Maxwell', { role: 'All-Rounder', final_price: 10_000_000, sold_to: 't1', queue_position: 4,  base_price: 1_000_000,  nationality: 'Australia' })
const p5 = P('p5', 'Gill',    { role: 'Batsman',     final_price:  2_000_000, sold_to: 't2', queue_position: 5,  base_price: 2_000_000,  nationality: 'India',    uncapped: false })
const p6 = P('p6', 'Rahul',   { role: 'Batsman',     final_price:  5_000_000, sold_to: 't3', queue_position: 6,  base_price: 500_000,    nationality: 'India' })
const p7 = P('p7', 'Boland',  { role: 'Bowler',      final_price:  3_000_000, sold_to: 't1', queue_position: 7,  base_price: 500_000,    nationality: 'Australia', uncapped: true })
const p8 = P('p8', 'Rashid',  { role: 'Bowler',      final_price:  8_000_000, sold_to: 't2', queue_position: 8,  base_price: 1_000_000,  nationality: 'Afghanistan' })
const p9 = P('p9', 'Pant',    { role: 'Wicket-Keeper', final_price: 12_000_000, sold_to: 't3', queue_position: 9, base_price: 2_000_000, nationality: 'India' })

// Retention (queue_position = 0) — should be excluded from player-specific stats
const ret = P('r1', 'Hardik', { role: 'All-Rounder', final_price: 15_000_000, sold_to: 't1', queue_position: 0, base_price: 5_000_000, nationality: 'India' })

// Unsold player
const unsold1 = P('u1', 'Unknown', { status: 'unsold', queue_position: 10, sold_to: undefined, final_price: undefined })
const unsold2 = P('u2', 'Unknown2', { status: 'unsold', queue_position: 11, sold_to: undefined, final_price: undefined })

const soldPlayers  = [p1, p2, p3, p4, p5, p6, p7, p8, p9, ret]
const allPlayers   = [...soldPlayers, unsold1, unsold2]

// Bids:
// p1 (Virat): t1×6, t2×4, t3×2  → 12 bids, most contested
// p2 (Bumrah): t1×2, t2×3       → 5 bids
// p3 (Stokes): t1×1, t2×5, t3×4 → 10 bids
// p4 (Maxwell): t1×3             → 3 bids
// p5 (Gill): t2×1                → 1 bid (fastest sold)
// p6 (Rahul): t3×2               → 2 bids
// p7 (Boland): t1×1              → 1 bid
// p8 (Rashid): t2×4, t3×2        → 6 bids
// p9 (Pant): t1×2, t3×3          → 5 bids
// Total per team: t1=6+2+3+1+1+2=15, t2=4+3+5+1+4=17, t3=2+4+2+3=11
// t2 (Bravo) most aggressive

const bids = [
  // p1
  ...Array(6).fill(null).map(() => B('p1', 't1')),
  ...Array(4).fill(null).map(() => B('p1', 't2')),
  ...Array(2).fill(null).map(() => B('p1', 't3')),
  // p2
  ...Array(2).fill(null).map(() => B('p2', 't1')),
  ...Array(3).fill(null).map(() => B('p2', 't2')),
  // p3
  ...Array(1).fill(null).map(() => B('p3', 't1')),
  ...Array(5).fill(null).map(() => B('p3', 't2')),
  ...Array(4).fill(null).map(() => B('p3', 't3')),
  // p4
  ...Array(3).fill(null).map(() => B('p4', 't1')),
  // p5
  B('p5', 't2'),
  // p6
  ...Array(2).fill(null).map(() => B('p6', 't3')),
  // p7
  B('p7', 't1'),
  // p8
  ...Array(4).fill(null).map(() => B('p8', 't2')),
  ...Array(2).fill(null).map(() => B('p8', 't3')),
  // p9
  ...Array(2).fill(null).map(() => B('p9', 't1')),
  ...Array(3).fill(null).map(() => B('p9', 't3')),
]

const stats = computeAuctionStats(teams, soldPlayers, allPlayers, bids)

// ── 1. Returns empty when no sold players ─────────────────────────────────────

console.log('\n1. Returns empty array when no sold players')
{
  const empty = computeAuctionStats(teams, [], [], [])
  assert(empty.length === 0, 'Empty result for no sold players')
}

// ── 2. Team Stats ─────────────────────────────────────────────────────────────

console.log('\n2. Team Stats')
{
  // Alpha spent: 20+10+3+15(retention) = 48cr → but Bravo: 15+2+8 = 25cr, Charlie: 18+5+12 = 35cr
  // Wait: alpha budget_remaining=50M. alpha spent = 100M-50M=50M? No, budget_remaining IS what's left.
  // We compute totalSpent from soldPlayers final_price sums.
  // Alpha: p1(20M) + p4(10M) + p7(3M) + ret(15M) = 48M
  // Bravo: p2(15M) + p5(2M) + p8(8M) = 25M
  // Charlie: p3(18M) + p6(5M) + p9(12M) = 35M
  // Alpha spent most
  assertStat(stats, 'Biggest Splurge', 'Alpha', '4.8cr')

  // Bravo has most budget remaining (80M)
  assertStat(stats, 'Most Frugal', 'Bravo', '8cr')

  // Bravo placed most bids (17)
  assertStat(stats, 'Most Aggressive Bidder', 'Bravo', '17 bids placed')
}

// ── 3. Player Stats ───────────────────────────────────────────────────────────

console.log('\n3. Player Stats')
{
  // Most Expensive auctioned: p1 Virat @ 20M = 2cr (retention Hardik excluded)
  assertStat(stats, 'Most Expensive', 'Virat', '2cr')
  assertStat(stats, 'Most Expensive', 'Virat', 'Alpha')

  // Most Contested: p1 Virat with 12 bids
  assertStat(stats, 'Most Contested', 'Virat', '12 bids')
  assertStat(stats, 'Most Contested', 'Virat', 'Alpha')

  // Biggest Steal: lowest ratio = Gill p5: 2M/2M = 1.0x
  // (Virat: 20/2=10x, Bumrah:15/2=7.5x, Stokes:18/1=18x, Maxwell:10/1=10x,
  //  Gill:2/2=1x ← lowest, Rahul:5/0.5=10x, Boland:3/0.5=6x, Rashid:8/1=8x, Pant:12/2=6x)
  assertStat(stats, 'Biggest Steal', 'Gill')

  // Biggest Markup: highest ratio = Stokes p3: 18M/1M = 18x
  assertStat(stats, 'Biggest Markup', 'Stokes', '18.0x')
}

// ── 4. Novelty ────────────────────────────────────────────────────────────────

console.log('\n4. Novelty')
{
  // Fastest Sold: Gill or Boland both have 1 bid — whichever comes first
  const fastest = find(stats, 'Fastest Sold')
  assert(!!fastest, 'Fastest Sold exists')
  assert(fastest?.sub.includes('1 bid') ?? false, `Fastest Sold sub mentions 1 bid (got "${fastest?.sub}")`)

  // Most Overseas: Alpha has Stokes(Eng)+Maxwell(Aus)+Boland(Aus) → wait:
  // p3 Stokes → t3 Charlie, p4 Maxwell → t1 Alpha, p7 Boland → t1 Alpha, p8 Rashid(Afghanistan) → t2 Bravo
  // Alpha overseas: Maxwell(AU) + Boland(AU) = 2
  // Bravo overseas: Rashid(AFG) = 1
  // Charlie overseas: Stokes(ENG) = 1
  // Alpha wins
  assertStat(stats, 'Most Overseas Players', 'Alpha', '2 international')

  // Uncapped Army: only Boland is uncapped → Alpha has 1
  assertStat(stats, 'Uncapped Army', 'Alpha', '1 uncapped')
}

// ── 5. Category Kings ─────────────────────────────────────────────────────────

console.log('\n5. Category Kings')
{
  // Best Batsman: Virat 20M = 2cr > Rahul 5M > Gill 2M → Virat
  assertStat(stats, 'Best Batsman', 'Virat', '2cr')

  // Best Bowler: Bumrah 15M = 1.5cr > Rashid 8M > Boland 3M → Bumrah
  assertStat(stats, 'Best Bowler', 'Bumrah', '1.5cr')

  // Best All-Rounder: Stokes 18M = 1.8cr > Maxwell 10M (Hardik retention excluded) → Stokes
  assertStat(stats, 'Best All-Rounder', 'Stokes', '1.8cr')
}

// ── 6. Auction Flow ───────────────────────────────────────────────────────────

console.log('\n6. Auction Flow')
{
  // First Sold: queue_position=1 → Virat
  assertStat(stats, 'First Sold', 'Virat')

  // Unsold Rate: 2 unsold of 12 total
  assertStat(stats, 'Unsold Rate', '2 of 12', '17% went unsold')

  // Last Man Standing: queue_position=9 → Pant (ret has queue_position=0, excluded)
  assertStat(stats, 'Last Man Standing', 'Pant')
}

// ── 7. Head-to-Head ───────────────────────────────────────────────────────────

console.log('\n7. Head-to-Head')
{
  // Biggest Rivals: which pair of teams bid on the most shared players?
  // t1+t2 share: p1✓ p2✓ p3✓ → 3 players
  // t1+t3 share: p1✓ p3✓ p9✓ → 3 players
  // t2+t3 share: p1✓ p3✓ p8✓ p9✗(only t1+t3) → p1✓ p3✓ p6✗(only t3) p8✓ → 3 players
  // All pairs tied at 3 — whichever comes first is fine, just check it appears
  const rivals = find(stats, 'Biggest Rivals')
  assert(!!rivals, 'Biggest Rivals stat exists')
  assert(rivals?.sub.includes('3 players') ?? false, `Rivals sub mentions 3 players (got "${rivals?.sub}")`)

  // Dominant Bidder: players with 5+ bids:
  // p1(12 bids) won by Alpha
  // p2(5 bids) won by Bravo
  // p3(10 bids) won by Charlie
  // p8(6 bids) won by Bravo
  // p9(5 bids) won by Charlie
  // Alpha: 1, Bravo: 2, Charlie: 2 — tie between Bravo and Charlie, whichever wins
  const dominant = find(stats, 'Dominant Bidder')
  assert(!!dominant, 'Dominant Bidder stat exists')
  assert(
    dominant?.value === 'Bravo' || dominant?.value === 'Charlie',
    `Dominant Bidder is Bravo or Charlie (got "${dominant?.value}")`
  )
  assert(dominant?.sub.includes('2 highly contested') ?? false, `Dominant Bidder won 2 (got "${dominant?.sub}")`)
}

// ── 8. Retention excluded from player stats ───────────────────────────────────

console.log('\n8. Retentions (queue_position=0) excluded from player-specific stats')
{
  // Hardik (ret) is the most expensive overall (15M) but should NOT appear in Most Expensive
  // because Virat (20M, auctioned) is more expensive anyway — let's specifically test
  // Best All-Rounder: Hardik would be 15M but Stokes is 18M, so it's still Stokes.
  // Let's add a targeted test: create a scenario where retention WOULD win if not excluded.
  const retOnlyTeams = [alpha, bravo]
  const cheapAuctioned = P('x1', 'CheapAR', { role: 'All-Rounder', final_price: 1_000_000, sold_to: 't1', queue_position: 1, base_price: 500_000 })
  const expRetention   = P('x2', 'ExpRet',  { role: 'All-Rounder', final_price: 50_000_000, sold_to: 't2', queue_position: 0, base_price: 5_000_000 })

  const retStats = computeAuctionStats(
    retOnlyTeams,
    [cheapAuctioned, expRetention],
    [cheapAuctioned, expRetention],
    [B('x1', 't1')]
  )
  assertStat(retStats, 'Best All-Rounder', 'CheapAR')  // not ExpRet
  const mostExpRet = find(retStats, 'Most Expensive')
  assert(mostExpRet?.value === 'CheapAR', `Most Expensive excludes retention: got "${mostExpRet?.value}" (want CheapAR)`)
}

// ── 9. Edge: no bids ──────────────────────────────────────────────────────────

console.log('\n9. Edge cases')
{
  const noBidStats = computeAuctionStats(teams, [p1, p2], [p1, p2], [])
  assert(!find(noBidStats, 'Most Aggressive Bidder'), 'No bids → Most Aggressive Bidder absent')
  assert(!find(noBidStats, 'Most Contested'), 'No bids → Most Contested absent')
  assert(!find(noBidStats, 'Fastest Sold'), 'No bids → Fastest Sold absent')
  assert(!find(noBidStats, 'Biggest Rivals'), 'No bids → Biggest Rivals absent')
  assert(!find(noBidStats, 'Dominant Bidder'), 'No bids → Dominant Bidder absent')

  // Unsold Rate when 0 unsold
  const allSoldStats = computeAuctionStats([alpha], [p1], [p1], [])
  assertStat(allSoldStats, 'Unsold Rate', '0 of 1', '0% went unsold')

  // No overseas players → stat absent
  const indiaOnly = [p1, p5].map(p => ({ ...p, nationality: 'India' }))
  const noOverseas = computeAuctionStats([alpha, bravo], indiaOnly, indiaOnly, [])
  assert(!find(noOverseas, 'Most Overseas Players'), 'No overseas → stat absent')

  // No uncapped players → stat absent
  const noUncapped = [p1, p2].map(p => ({ ...p, uncapped: false }))
  const noUncappedStats = computeAuctionStats([alpha, bravo], noUncapped, noUncapped, [])
  assert(!find(noUncappedStats, 'Uncapped Army'), 'No uncapped → stat absent')

  // Rivals only shown if 2+ shared players
  const singleSharedBids = [B('p1', 't1'), B('p1', 't2')]  // only 1 shared player
  const noRivals = computeAuctionStats([alpha, bravo], [p1], [p1], singleSharedBids)
  assert(!find(noRivals, 'Biggest Rivals'), 'Only 1 shared player → Biggest Rivals absent')
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
