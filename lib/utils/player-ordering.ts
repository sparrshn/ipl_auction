const CATEGORIES = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'] as const

const shuffle = <T,>(arr: T[]): T[] =>
  arr.map((v) => [Math.random(), v] as [number, T])
     .sort((a, b) => a[0] - b[0])
     .map((x) => x[1])

/**
 * Orders players into greedy-interleaved chunks of 10 per category.
 * No two adjacent chunks share the same category.
 * Players with unrecognised roles are appended at the end (shuffled).
 */
export function buildOrderedQueue<T extends { role?: string | null }>(players: T[]): T[] {
  const chunksByCategory: Record<string, T[][]> = {}
  for (const cat of CATEGORIES) {
    const catPlayers = shuffle(players.filter((p) => p.role === cat))
    chunksByCategory[cat] = []
    for (let i = 0; i < catPlayers.length; i += 10) {
      chunksByCategory[cat].push(catPlayers.slice(i, i + 10))
    }
  }

  const interleaved: T[] = []
  let prevCat = ''
  while (true) {
    const available = Object.entries(chunksByCategory)
      .filter(([cat, arr]) => arr.length > 0 && cat !== prevCat)
      .sort((a, b) => b[1].length - a[1].length)
    if (available.length === 0) {
      const forced = Object.entries(chunksByCategory).find(([, arr]) => arr.length > 0)
      if (!forced) break
      interleaved.push(...forced[1].shift()!)
      prevCat = forced[0]
    } else {
      const maxLen = available[0][1].length
      const tied = available.filter(([, arr]) => arr.length === maxLen)
      const [cat, arr] = tied[Math.floor(Math.random() * tied.length)]
      interleaved.push(...arr.shift()!)
      prevCat = cat
    }
  }

  const rest = shuffle(players.filter((p) => !(CATEGORIES as readonly string[]).includes(p.role ?? '')))
  return [...interleaved, ...rest]
}
