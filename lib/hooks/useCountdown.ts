'use client'

import { useEffect, useState, useRef } from 'react'

/**
 * Computes remaining seconds given a server timestamp + duration.
 *
 * Strategy:
 *  - When timerStartedAt CHANGES (realtime event), all clients receive it at
 *    approximately the same wall-clock moment.  We capture that local receive
 *    time and count elapsed time from there — no server clock needed, so
 *    device clock skew across different timezones/locations doesn't matter.
 *  - On the INITIAL load (client joins mid-auction, page refresh) we use a
 *    one-shot clock sync against /api/time to estimate how much time has
 *    already elapsed.  If that sync fails or is slow, we fall back to
 *    timerDuration (slightly wrong initial value, corrected on next player).
 */
export function useCountdown(
  timerStartedAt: string | null,
  timerDuration: number,
  paused = false,
  pausedAt: string | null = null
) {
  const [remaining, setRemaining] = useState<number>(0)

  // localStartMs: the LOCAL Date.now() equivalent of when this timer began.
  // Setting this once per timerStartedAt value lets the interval use pure
  // elapsed-time arithmetic, immune to inter-device clock differences.
  const localStartMsRef = useRef<number | null>(null)
  const prevTimerStartedAtRef = useRef<string | null>(null)
  const clockOffsetRef = useRef<number>(0)
  const syncDoneRef = useRef<boolean>(false)

  // One-shot clock sync — only used to compute initial elapsed on page load.
  useEffect(() => {
    async function syncClock() {
      try {
        const t0 = Date.now()
        const res = await fetch('/api/time')
        const t1 = Date.now()
        const { serverTime } = await res.json()
        clockOffsetRef.current = serverTime - (t0 + t1) / 2
      } catch {
        // Keep offset 0 — graceful degradation
      }
      syncDoneRef.current = true

      // If timerStartedAt was already set before sync completed, recompute
      // localStartMs now that we have an accurate offset.
      if (prevTimerStartedAtRef.current) {
        localStartMsRef.current = computeLocalStart(
          prevTimerStartedAtRef.current,
          timerDuration,
          clockOffsetRef.current
        )
      }
    }
    syncClock()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!timerStartedAt) {
      setRemaining(0)
      localStartMsRef.current = null
      prevTimerStartedAtRef.current = null
      return
    }

    // timerStartedAt changed — new player or bid reset
    if (timerStartedAt !== prevTimerStartedAtRef.current) {
      prevTimerStartedAtRef.current = timerStartedAt

      if (syncDoneRef.current) {
        // Sync already completed: use accurate offset to estimate elapsed
        localStartMsRef.current = computeLocalStart(
          timerStartedAt,
          timerDuration,
          clockOffsetRef.current
        )
      } else {
        // Sync still in-flight: assume timer just started (best guess).
        // The sync completion above will correct this within ~200 ms.
        localStartMsRef.current = Date.now()
      }
    }

    if (paused) {
      if (pausedAt && localStartMsRef.current !== null) {
        // Freeze: how much elapsed before the pause?
        const pauseServerMs = new Date(pausedAt).getTime()
        const startServerMs = new Date(timerStartedAt).getTime()
        const elapsedAtPause = (pauseServerMs - startServerMs) / 1000
        setRemaining(Math.max(0, Math.ceil(timerDuration - elapsedAtPause)))
      }
      return
    }

    const interval = setInterval(() => {
      if (localStartMsRef.current === null) return
      const elapsed = (Date.now() - localStartMsRef.current) / 1000
      setRemaining(Math.max(0, Math.ceil(timerDuration - elapsed)))
    }, 100)

    return () => clearInterval(interval)
  }, [timerStartedAt, timerDuration, paused, pausedAt])

  return remaining
}

/**
 * Given a server ISO timestamp, compute the LOCAL Date.now() value that
 * represents "when the timer started" — accounting for server/client clock skew.
 */
function computeLocalStart(
  timerStartedAt: string,
  timerDuration: number,
  clockOffset: number
): number {
  const serverStartMs = new Date(timerStartedAt).getTime()
  const correctedNow = Date.now() + clockOffset
  const alreadyElapsedMs = Math.min(
    timerDuration * 1000,         // can't be more than the full duration
    Math.max(0, correctedNow - serverStartMs)
  )
  return Date.now() - alreadyElapsedMs
}
