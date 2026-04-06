'use client'

import { useEffect, useRef } from 'react'
import { useCountdown } from '@/lib/hooks/useCountdown'
import { playTick } from '@/lib/utils/sounds'

interface Props {
  timerStartedAt: string | null
  timerDuration: number
  paused?: boolean
  pausedAt?: string | null
}

export function CountdownTimer({ timerStartedAt, timerDuration, paused = false, pausedAt = null }: Props) {
  const remaining = useCountdown(timerStartedAt, timerDuration, paused, pausedAt)
  const lastTickRef = useRef<number>(-1)

  useEffect(() => {
    if (paused || !timerStartedAt || remaining <= 0 || remaining > 10) {
      lastTickRef.current = -1
      return
    }
    if (remaining !== lastTickRef.current) {
      lastTickRef.current = remaining
      playTick(remaining <= 5)
    }
  }, [remaining, paused, timerStartedAt])

  const colorClass =
    remaining > 15
      ? 'text-green-400'
      : remaining > 8
      ? 'text-yellow-400'
      : 'text-red-500 animate-pulse-fast'

  const pct = timerStartedAt ? (remaining / timerDuration) * 100 : 0

  const barColor =
    remaining > 15
      ? 'bg-green-500'
      : remaining > 8
      ? 'bg-yellow-400'
      : 'bg-red-500'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-6xl font-black tabular-nums leading-none ${colorClass}`}>
        {timerStartedAt ? remaining : '--'}
      </div>
      <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">seconds</p>
    </div>
  )
}
