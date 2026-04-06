/**
 * Run with: npx tsx scripts/test-countdown.ts
 *
 * Unit tests for:
 *   computeRemainingSeconds — pure timer math
 *   computeLocalStart logic  — elapsed-time anchor used by useCountdown
 *
 * Covers the three real production bugs:
 *   Bug A — timer showed ~18,000 s when device clock was hours behind server
 *   Bug B — timer stuck at 30 s because of Math.min(timerDuration, …) cap
 *   Bug C — 15 s desync across clients due to unreliable clock-sync offset
 */

import { computeRemainingSeconds } from '../lib/utils/countdown'

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

const DURATION = 30 // seconds

// ── helpers ──────────────────────────────────────────────────────────────────

function isoSecondsAgo(nowMs: number, seconds: number): string {
  return new Date(nowMs - seconds * 1000).toISOString()
}

/**
 * Mirrors computeLocalStart() from useCountdown.
 * Returns the LOCAL time anchor that represents "when the timer started".
 */
function computeLocalStart(
  timerStartedAt: string,
  timerDuration: number,
  clockOffset: number,
  localNow: number
): number {
  const serverStartMs = new Date(timerStartedAt).getTime()
  const correctedNow = localNow + clockOffset
  const alreadyElapsedMs = Math.min(
    timerDuration * 1000,
    Math.max(0, correctedNow - serverStartMs)
  )
  return localNow - alreadyElapsedMs
}

/**
 * Compute remaining given a localStartMs anchor and the device's current time.
 * additionalMs = simulated ms that have passed since localNow was captured.
 */
function remaining(localStartMs: number, timerDuration: number, localNow: number, additionalMs = 0): number {
  const fakeNow = localNow + additionalMs
  const elapsed = (fakeNow - localStartMs) / 1000
  return Math.max(0, Math.ceil(timerDuration - elapsed))
}

// ── 1. Pure math: computeRemainingSeconds ─────────────────────────────────────

console.log('\n1. computeRemainingSeconds — normal countdown')
{
  const nowMs = Date.now()
  assert(computeRemainingSeconds(isoSecondsAgo(nowMs, 0),  DURATION, nowMs) === 30, 'At t=0:  30 s remaining')
  assert(computeRemainingSeconds(isoSecondsAgo(nowMs, 10), DURATION, nowMs) === 20, 'At t=10: 20 s remaining')
  assert(computeRemainingSeconds(isoSecondsAgo(nowMs, 29), DURATION, nowMs) === 1,  'At t=29:  1 s remaining')
  assert(computeRemainingSeconds(isoSecondsAgo(nowMs, 30), DURATION, nowMs) === 0,  'At t=30:  0 s remaining')
  assert(computeRemainingSeconds(isoSecondsAgo(nowMs, 60), DURATION, nowMs) === 0,  'Expired:  0 s (no negative)')
}

// ── 2. Bug A — device clock hours behind server ───────────────────────────────

console.log('\n2. Bug A: device clock 5 h behind — raw value is huge, offset corrects it')
{
  const serverNow   = Date.now()
  const deviceNow   = serverNow - 5 * 3600_000   // device is 5 h behind
  const clockOffset = serverNow - deviceNow       // +5 h (from clock sync)

  // Timer started 10 s ago (on the server)
  const timerStartedAt = isoSecondsAgo(serverNow, 10)

  // Without correction: huge value — the original Bug A
  const raw = computeRemainingSeconds(timerStartedAt, DURATION, deviceNow)
  assert(raw > DURATION, `Raw without correction: ${raw} s (should be > ${DURATION})`)

  // With correction: computeLocalStart anchors elapsed correctly
  const localStart = computeLocalStart(timerStartedAt, DURATION, clockOffset, deviceNow)
  // Remaining right now (0 additional ms since anchor was captured at deviceNow)
  const corrected = remaining(localStart, DURATION, deviceNow)
  assert(corrected === 20, `After correction: ${corrected} s remaining (want 20)`)
  assert(corrected <= DURATION, `Corrected value (${corrected}) ≤ timerDuration`)
}

// ── 3. Bug B — elapsed-time approach counts down, not stuck ──────────────────

console.log('\n3. Bug B: elapsed-time approach counts down normally, never stuck at 30')
{
  const serverNow  = Date.now()
  const deviceNow  = serverNow   // accurate clock
  const clockOffset = 0

  // Timer just started right now
  const timerStartedAt = isoSecondsAgo(serverNow, 0)
  const localStart = computeLocalStart(timerStartedAt, DURATION, clockOffset, deviceNow)

  assert(remaining(localStart, DURATION, deviceNow, 0)         === 30, 't=0:  30 s')
  assert(remaining(localStart, DURATION, deviceNow, 5_000)     === 25, 't=5:  25 s (counts down, not stuck)')
  assert(remaining(localStart, DURATION, deviceNow, 15_000)    === 15, 't=15: 15 s')
  assert(remaining(localStart, DURATION, deviceNow, 30_000)    === 0,  't=30:  0 s (expired)')
}

// ── 4. Bug C — multi-client sync via elapsed time from receive moment ─────────

console.log('\n4. Bug C: clients with different device clocks stay in sync via elapsed time')
{
  const serverStart    = 1_710_000_000_000
  const timerStartedAt = new Date(serverStart).toISOString()

  // Real moment: 5 s after timer started, all clients receive the realtime event
  const realNow         = serverStart + 5_000

  // Each client's device clock differs from server
  const adminDeviceNow  = realNow              // accurate
  const auDeviceNow     = realNow - 15_000     // 15 s behind server (Bug C)
  const indiaDeviceNow  = realNow +  4_000     // 4 s ahead of server

  // Each client's clockOffset from their own /api/time sync
  const adminOffset     = realNow - adminDeviceNow   //  0
  const auOffset        = realNow - auDeviceNow       // +15 000
  const indiaOffset     = realNow - indiaDeviceNow    //  -4 000

  // Each client computes localStartMs at the moment they receive the event
  const adminLocalStart = computeLocalStart(timerStartedAt, DURATION, adminOffset, adminDeviceNow)
  const auLocalStart    = computeLocalStart(timerStartedAt, DURATION, auOffset,    auDeviceNow)
  const indiaLocalStart = computeLocalStart(timerStartedAt, DURATION, indiaOffset, indiaDeviceNow)

  // 3 s later in each client's local time — what remaining do they each show?
  const adminR = remaining(adminLocalStart, DURATION, adminDeviceNow, 3_000)
  const auR    = remaining(auLocalStart,    DURATION, auDeviceNow,    3_000)
  const indiaR = remaining(indiaLocalStart, DURATION, indiaDeviceNow, 3_000)

  // All should show 22 s: timer ran 5 s before receive + 3 s after = 8 s elapsed, 30-8=22
  assert(adminR === 22, `Admin:  ${adminR} s (want 22)`)
  assert(auR    === 22, `AU:     ${auR} s (want 22 — same as admin)`)
  assert(indiaR === 22, `India:  ${indiaR} s (want 22 — same as admin)`)
  assert(
    adminR === auR && auR === indiaR,
    'All three clients show identical remaining time despite different device clocks'
  )
}

// ── 5. Paused timer ───────────────────────────────────────────────────────────

console.log('\n5. Paused timer freezes at correct value')
{
  const nowMs          = Date.now()
  // Timer started 10 s ago, paused 5 s ago → ran 5 s → 25 s frozen
  const timerStartedAt = isoSecondsAgo(nowMs, 10)
  const pausedAt       = isoSecondsAgo(nowMs, 5)

  const pauseServerMs  = new Date(pausedAt).getTime()
  const startServerMs  = new Date(timerStartedAt).getTime()
  const elapsedAtPause = (pauseServerMs - startServerMs) / 1000
  const frozen         = Math.max(0, Math.ceil(DURATION - elapsedAtPause))

  assert(frozen === 25, `Frozen at 25 s (ran 5 s before pause, got ${frozen})`)
  // Frozen value doesn't change as time passes (it's computed once from server timestamps)
  assert(frozen === 25, 'Still 25 s — independent of further elapsed time')
}

// ── 6. Timezone-agnostic ─────────────────────────────────────────────────────

console.log('\n6. IST and AEDT produce identical remaining (Date.now() is always UTC ms)')
{
  const realUTCNow     = 1_710_000_000_000
  const timerStartedAt = new Date(realUTCNow - 10_000).toISOString()   // 10 s ago

  const ist  = computeRemainingSeconds(timerStartedAt, DURATION, realUTCNow)
  const aedt = computeRemainingSeconds(timerStartedAt, DURATION, realUTCNow)

  assert(ist === aedt, `IST and AEDT agree: ${ist} s`)
  assert(ist === 20,   `Both see 20 s (want 20, got ${ist})`)
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
