/**
 * Run with: npx tsx scripts/test-ordering.ts
 *
 * Tests:
 * 1. Every player appears exactly once (no repeats, no drops)
 * 2. Players are grouped in consecutive runs of the same category (chunks ≤ 10)
 * 3. Each chunk is ≤ 10 players
 * 4. The "coming up next" banner logic fires at the right moment
 */

type Role = 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper'

interface MockPlayer {
  name: string
  role: Role
}

// ── ordering logic (mirrors the route exactly) ──────────────────────────────

const shuffle = <T,>(arr: T[]): T[] =>
  arr.map((v) => [Math.random(), v] as [number, T])
     .sort((a, b) => a[0] - b[0])
     .map((x) => x[1])

const CATEGORIES: Role[] = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper']

function orderPlayers(players: MockPlayer[]): MockPlayer[] {
  // Split each category into shuffled chunks of 10
  const chunksByCategory: Record<string, MockPlayer[][]> = {}
  for (const cat of CATEGORIES) {
    const catPlayers = shuffle(players.filter((p) => p.role === cat))
    chunksByCategory[cat] = []
    for (let i = 0; i < catPlayers.length; i += 10) {
      chunksByCategory[cat].push(catPlayers.slice(i, i + 10))
    }
  }

  // Greedy interleave: no two same-category chunks adjacent
  const result: MockPlayer[] = []
  let prevCat = ''
  while (true) {
    const available = Object.entries(chunksByCategory)
      .filter(([cat, arr]) => arr.length > 0 && cat !== prevCat)
      .sort((a, b) => b[1].length - a[1].length)
    if (available.length === 0) {
      const forced = Object.entries(chunksByCategory).find(([, arr]) => arr.length > 0)
      if (!forced) break
      result.push(...forced[1].shift()!)
      prevCat = forced[0]
    } else {
      const maxLen = available[0][1].length
      const tied = available.filter(([, arr]) => arr.length === maxLen)
      const [cat, arr] = tied[Math.floor(Math.random() * tied.length)]
      result.push(...arr.shift()!)
      prevCat = cat
    }
  }
  return result
}

// ── nextCategory logic (mirrors auction page) ────────────────────────────────

function getNextCategory(ordered: MockPlayer[], currentIndex: number): Role | null {
  const pending = ordered.slice(currentIndex + 1)
  const nextPlayer = pending[0] ?? null
  if (!nextPlayer || nextPlayer.role === ordered[currentIndex].role) return null
  return nextPlayer.role
}

// ── test helpers ─────────────────────────────────────────────────────────────

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

// ── build a test pool ────────────────────────────────────────────────────────

function makePlayer(role: Role, n: number): MockPlayer {
  return { name: `${role}-${n}`, role }
}

// 25 Batsmen, 20 Bowlers, 12 All-Rounders, 8 Wicket-Keepers = 65 total
const players: MockPlayer[] = [
  ...Array.from({ length: 25 }, (_, i) => makePlayer('Batsman', i + 1)),
  ...Array.from({ length: 20 }, (_, i) => makePlayer('Bowler', i + 1)),
  ...Array.from({ length: 12 }, (_, i) => makePlayer('All-Rounder', i + 1)),
  ...Array.from({ length: 8  }, (_, i) => makePlayer('Wicket-Keeper', i + 1)),
]

// ── run tests ────────────────────────────────────────────────────────────────

// Run the ordering multiple times to catch randomness issues
for (let run = 0; run < 5; run++) {
  console.log(`\nRun ${run + 1}`)

  const ordered = orderPlayers(players)

  // 1. No player is dropped
  assert(ordered.length === players.length, `All ${players.length} players present (got ${ordered.length})`)

  // 2. No player appears twice
  const names = ordered.map((p) => p.name)
  const unique = new Set(names)
  assert(unique.size === players.length, `No duplicate players (${unique.size} unique)`)

  // 3. Players are in consecutive same-category runs (chunks), each ≤ 10
  let chunkStart = 0
  let maxChunkSize = 0
  let chunkViolation = false

  while (chunkStart < ordered.length) {
    const role = ordered[chunkStart].role
    let end = chunkStart
    while (end < ordered.length && ordered[end].role === role) end++
    const chunkSize = end - chunkStart
    if (chunkSize > 10) chunkViolation = true
    maxChunkSize = Math.max(maxChunkSize, chunkSize)
    chunkStart = end
  }
  assert(!chunkViolation, `All category runs ≤ 10 players (largest was ${maxChunkSize})`)

  // 4. nextCategory fires exactly at chunk boundaries (last player of each chunk)
  let bannerMisses = 0
  let falseBanners = 0
  let i = 0
  while (i < ordered.length) {
    const role = ordered[i].role
    // find end of this chunk
    let end = i
    while (end < ordered.length && ordered[end].role === role) end++
    const chunkLastIndex = end - 1

    // The banner should fire on the last player of the chunk (if there's a next player)
    for (let j = i; j < end; j++) {
      const next = getNextCategory(ordered, j)
      if (j === chunkLastIndex && j + 1 < ordered.length) {
        // banner MUST show and point to the next chunk's category
        if (next !== ordered[j + 1].role) bannerMisses++
      } else if (j < chunkLastIndex) {
        // banner must NOT show (still within same chunk)
        if (next !== null) falseBanners++
      }
    }
    i = end
  }
  assert(bannerMisses === 0, `"Coming up next" banner fires on every chunk boundary (misses: ${bannerMisses})`)
  assert(falseBanners === 0, `"Coming up next" banner never fires mid-chunk (false positives: ${falseBanners})`)
}

// ── edge case: fewer than 10 players in a category ───────────────────────────

console.log('\nEdge case: small pool (3 Batsmen, 2 Bowlers)')
const small: MockPlayer[] = [
  ...Array.from({ length: 3 }, (_, i) => makePlayer('Batsman', i + 1)),
  ...Array.from({ length: 2 }, (_, i) => makePlayer('Bowler', i + 1)),
]
const smallOrdered = orderPlayers(small)
assert(smallOrdered.length === 5, 'All 5 small-pool players present')
assert(new Set(smallOrdered.map((p) => p.name)).size === 5, 'No duplicates in small pool')

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
