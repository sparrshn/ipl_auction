/**
 * Pure function — computes remaining seconds for the countdown timer.
 * Extracted from useCountdown so it can be unit-tested without React.
 */
export function computeRemainingSeconds(
  timerStartedAt: string,
  timerDuration: number,
  nowMs: number,
  paused = false,
  pausedAt: string | null = null
): number {
  const startMs = new Date(timerStartedAt).getTime()
  if (paused && pausedAt) {
    const pauseMs = new Date(pausedAt).getTime()
    return Math.max(0, Math.ceil(timerDuration - (pauseMs - startMs) / 1000))
  }
  const endMs = startMs + timerDuration * 1000
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000))
}
