import type { Team, Player } from '@/lib/supabase/types'

export interface StatCard {
  emoji: string
  label: string
  value: string
  sub: string
}

export interface BidRef {
  player_id: string
  team_id: string
}

function fmt(rupees: number): string {
  if (rupees >= 10_000_000) return `${(rupees / 10_000_000).toFixed(rupees % 10_000_000 === 0 ? 0 : 1)}cr`
  if (rupees >= 100_000)    return `${(rupees / 100_000).toFixed(rupees % 100_000 === 0 ? 0 : 1)}L`
  return `₹${rupees.toLocaleString()}`
}

export function computeAuctionStats(
  teams: Team[],
  soldPlayers: Player[],   // all players with status='sold'
  allPlayers: Player[],    // ALL players (any status) for total count
  bids: BidRef[]
): StatCard[] {
  if (soldPlayers.length === 0) return []

  const stats: StatCard[] = []

  // Auctioned players: queue_position > 0 (exclude retentions)
  const auctionedPlayers = soldPlayers.filter(p => p.queue_position > 0)

  // Helper: get team name by id
  const teamMap = new Map(teams.map(t => [t.id, t]))

  // Helper: bids per player
  const bidsPerPlayer = new Map<string, { player_id: string; team_ids: string[] }>()
  for (const bid of bids) {
    const entry = bidsPerPlayer.get(bid.player_id)
    if (entry) {
      entry.team_ids.push(bid.team_id)
    } else {
      bidsPerPlayer.set(bid.player_id, { player_id: bid.player_id, team_ids: [bid.team_id] })
    }
  }

  // Helper: count of bids per player (unique entry = one bid)
  const bidCountPerPlayer = new Map<string, number>()
  bidsPerPlayer.forEach((entry, playerId) => {
    bidCountPerPlayer.set(playerId, entry.team_ids.length)
  })

  // ── Team Stats ──────────────────────────────────────────────────────────────

  // Biggest Splurge
  const teamSpend = teams.map(t => {
    const spent = soldPlayers
      .filter(p => p.sold_to_team_id === t.id)
      .reduce((sum, p) => sum + (p.final_price ?? 0), 0)
    return { team: t, spent }
  })
  const biggestSpender = teamSpend.reduce((best, cur) => cur.spent > best.spent ? cur : best, teamSpend[0])
  if (biggestSpender) {
    stats.push({
      emoji: '💸',
      label: 'Biggest Splurge',
      value: biggestSpender.team.name,
      sub: `${fmt(biggestSpender.spent)} spent`,
    })
  }

  // Most Frugal
  const mostFrugal = teams.reduce((best, cur) => cur.budget_remaining > best.budget_remaining ? cur : best, teams[0])
  if (mostFrugal) {
    stats.push({
      emoji: '🏦',
      label: 'Most Frugal',
      value: mostFrugal.name,
      sub: `${fmt(mostFrugal.budget_remaining)} left`,
    })
  }

  // Most Aggressive Bidder
  if (bids.length > 0) {
    const bidsByTeam = new Map<string, number>()
    for (const bid of bids) {
      bidsByTeam.set(bid.team_id, (bidsByTeam.get(bid.team_id) ?? 0) + 1)
    }
    let topTeamId = ''
    let topBidCount = 0
    bidsByTeam.forEach((count, teamId) => {
      if (count > topBidCount) {
        topBidCount = count
        topTeamId = teamId
      }
    })
    const aggressiveTeam = teamMap.get(topTeamId)
    if (aggressiveTeam) {
      stats.push({
        emoji: '🎯',
        label: 'Most Aggressive Bidder',
        value: aggressiveTeam.name,
        sub: `${topBidCount} bids placed`,
      })
    }
  }

  // ── Player Stats ─────────────────────────────────────────────────────────────

  // Most Expensive (auctioned)
  if (auctionedPlayers.length > 0) {
    const mostExpensive = auctionedPlayers.reduce(
      (best, cur) => (cur.final_price ?? 0) > (best.final_price ?? 0) ? cur : best,
      auctionedPlayers[0]
    )
    const team = teamMap.get(mostExpensive.sold_to_team_id ?? '')
    stats.push({
      emoji: '👑',
      label: 'Most Expensive',
      value: mostExpensive.name,
      sub: `${fmt(mostExpensive.final_price ?? 0)} · ${team?.name ?? 'Unknown'}`,
    })
  }

  // Most Contested (auctioned, most bids)
  if (bids.length > 0 && auctionedPlayers.length > 0) {
    let mostContestedPlayer: Player | null = null
    let mostContestedBids = 0
    for (const p of auctionedPlayers) {
      const count = bidCountPerPlayer.get(p.id) ?? 0
      if (count > mostContestedBids) {
        mostContestedBids = count
        mostContestedPlayer = p
      }
    }
    if (mostContestedPlayer) {
      const team = teamMap.get(mostContestedPlayer.sold_to_team_id ?? '')
      stats.push({
        emoji: '🔥',
        label: 'Most Contested',
        value: mostContestedPlayer.name,
        sub: `${mostContestedBids} bids · won by ${team?.name ?? 'Unknown'}`,
      })
    }
  }

  // Biggest Steal (lowest final/base ratio, auctioned)
  if (auctionedPlayers.length > 0) {
    const withRatio = auctionedPlayers
      .filter(p => p.base_price > 0 && p.final_price !== null)
      .map(p => ({ player: p, ratio: (p.final_price ?? 0) / p.base_price }))
    if (withRatio.length > 0) {
      const steal = withRatio.reduce((best, cur) => cur.ratio < best.ratio ? cur : best, withRatio[0])
      const team = teamMap.get(steal.player.sold_to_team_id ?? '')
      stats.push({
        emoji: '💎',
        label: 'Biggest Steal',
        value: steal.player.name,
        sub: `${fmt(steal.player.final_price ?? 0)} (base: ${fmt(steal.player.base_price)}) · ${team?.name ?? 'Unknown'}`,
      })
    }
  }

  // Biggest Markup (highest final/base ratio, auctioned)
  if (auctionedPlayers.length > 0) {
    const withRatio = auctionedPlayers
      .filter(p => p.base_price > 0 && p.final_price !== null)
      .map(p => ({ player: p, ratio: (p.final_price ?? 0) / p.base_price }))
    if (withRatio.length > 0) {
      const markup = withRatio.reduce((best, cur) => cur.ratio > best.ratio ? cur : best, withRatio[0])
      const team = teamMap.get(markup.player.sold_to_team_id ?? '')
      stats.push({
        emoji: '🚀',
        label: 'Biggest Markup',
        value: markup.player.name,
        sub: `${markup.ratio.toFixed(1)}x base price · ${fmt(markup.player.final_price ?? 0)} · ${team?.name ?? 'Unknown'}`,
      })
    }
  }

  // ── Novelty ──────────────────────────────────────────────────────────────────

  // Fastest Sold (fewest bids, auctioned) — only meaningful when bids exist
  if (bids.length > 0 && auctionedPlayers.length > 0) {
    let fastestPlayer: Player | null = null
    let fewestBids = Infinity
    for (const p of auctionedPlayers) {
      const count = bidCountPerPlayer.get(p.id) ?? 0
      if (count < fewestBids) {
        fewestBids = count
        fastestPlayer = p
      }
    }
    if (fastestPlayer) {
      stats.push({
        emoji: '⚡',
        label: 'Fastest Sold',
        value: fastestPlayer.name,
        sub: fewestBids === 1 ? 'Sold in 1 bid!' : `Only ${fewestBids} bids`,
      })
    }
  }

  // Most Overseas Players
  if (teams.length > 0) {
    const overseasByTeam = teams.map(t => {
      const count = soldPlayers.filter(
        p => p.sold_to_team_id === t.id &&
          p.nationality !== null &&
          p.nationality.toLowerCase() !== 'india'
      ).length
      return { team: t, count }
    })
    const topOverseas = overseasByTeam.reduce((best, cur) => cur.count > best.count ? cur : best, overseasByTeam[0])
    if (topOverseas && topOverseas.count > 0) {
      stats.push({
        emoji: '🌍',
        label: 'Most Overseas Players',
        value: topOverseas.team.name,
        sub: `${topOverseas.count} international players`,
      })
    }
  }

  // Uncapped Army
  if (teams.length > 0) {
    const uncappedByTeam = teams.map(t => {
      const count = soldPlayers.filter(
        p => p.sold_to_team_id === t.id && p.uncapped
      ).length
      return { team: t, count }
    })
    const topUncapped = uncappedByTeam.reduce((best, cur) => cur.count > best.count ? cur : best, uncappedByTeam[0])
    if (topUncapped && topUncapped.count > 0) {
      stats.push({
        emoji: '🌱',
        label: 'Uncapped Army',
        value: topUncapped.team.name,
        sub: `${topUncapped.count} uncapped players`,
      })
    }
  }

  // ── Category Kings ────────────────────────────────────────────────────────────

  const categoryStats: { emoji: string; label: string; role: Player['role'] }[] = [
    { emoji: '🏏', label: 'Best Batsman', role: 'Batsman' },
    { emoji: '🎳', label: 'Best Bowler', role: 'Bowler' },
    { emoji: '🔄', label: 'Best All-Rounder', role: 'All-Rounder' },
  ]

  for (const cat of categoryStats) {
    const rolePlayers = auctionedPlayers.filter(p => p.role === cat.role && p.final_price !== null)
    if (rolePlayers.length > 0) {
      const best = rolePlayers.reduce(
        (top, cur) => (cur.final_price ?? 0) > (top.final_price ?? 0) ? cur : top,
        rolePlayers[0]
      )
      const team = teamMap.get(best.sold_to_team_id ?? '')
      stats.push({
        emoji: cat.emoji,
        label: cat.label,
        value: best.name,
        sub: `${fmt(best.final_price ?? 0)} · ${team?.name ?? 'Unknown'}`,
      })
    }
  }

  // ── Auction Flow ──────────────────────────────────────────────────────────────

  // First Sold (lowest queue_position among auctioned)
  if (auctionedPlayers.length > 0) {
    const firstSold = auctionedPlayers.reduce(
      (best, cur) => cur.queue_position < best.queue_position ? cur : best,
      auctionedPlayers[0]
    )
    const team = teamMap.get(firstSold.sold_to_team_id ?? '')
    stats.push({
      emoji: '🎬',
      label: 'First Sold',
      value: firstSold.name,
      sub: `${fmt(firstSold.final_price ?? 0)} · ${team?.name ?? 'Unknown'}`,
    })
  }

  // Unsold Rate
  const totalPlayers = allPlayers.length
  const unsoldCount = allPlayers.filter(p => p.status === 'unsold').length
  if (totalPlayers > 0) {
    const pct = Math.round((unsoldCount / totalPlayers) * 100)
    stats.push({
      emoji: '📦',
      label: 'Unsold Rate',
      value: `${unsoldCount} of ${totalPlayers}`,
      sub: `${pct}% went unsold`,
    })
  }

  // Last Man Standing (highest queue_position among auctioned)
  if (auctionedPlayers.length > 0) {
    const lastSold = auctionedPlayers.reduce(
      (best, cur) => cur.queue_position > best.queue_position ? cur : best,
      auctionedPlayers[0]
    )
    const team = teamMap.get(lastSold.sold_to_team_id ?? '')
    stats.push({
      emoji: '⏱️',
      label: 'Last Man Standing',
      value: lastSold.name,
      sub: `${fmt(lastSold.final_price ?? 0)} · ${team?.name ?? 'Unknown'}`,
    })
  }

  // ── Head-to-Head ──────────────────────────────────────────────────────────────

  // Biggest Rivals
  if (bids.length > 0 && teams.length >= 2) {
    // For each player, collect the set of unique teams that bid on it
    const playerTeamSets = new Map<string, Set<string>>()
    for (const bid of bids) {
      const set = playerTeamSets.get(bid.player_id) ?? new Set<string>()
      set.add(bid.team_id)
      playerTeamSets.set(bid.player_id, set)
    }

    // For each pair of teams, count how many players they both bid on
    const pairCounts = new Map<string, number>()
    playerTeamSets.forEach((teamSet) => {
      const teamList = Array.from(teamSet)
      for (let i = 0; i < teamList.length; i++) {
        for (let j = i + 1; j < teamList.length; j++) {
          const key = [teamList[i], teamList[j]].sort().join('|')
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
        }
      }
    })

    let topPair = ''
    let topPairCount = 0
    pairCounts.forEach((count, pair) => {
      if (count > topPairCount) {
        topPairCount = count
        topPair = pair
      }
    })

    if (topPair && topPairCount >= 2) {
      const [id1, id2] = topPair.split('|')
      const team1 = teamMap.get(id1)
      const team2 = teamMap.get(id2)
      if (team1 && team2) {
        stats.push({
          emoji: '🤝',
          label: 'Biggest Rivals',
          value: `${team1.name} vs ${team2.name}`,
          sub: `Bid against each other on ${topPairCount} players`,
        })
      }
    }
  }

  // Dominant Bidder (won most players with 5+ bids)
  if (bids.length > 0 && auctionedPlayers.length > 0) {
    const highlyContested = auctionedPlayers.filter(p => (bidCountPerPlayer.get(p.id) ?? 0) >= 5)
    if (highlyContested.length > 0) {
      const winsByTeam = new Map<string, number>()
      for (const p of highlyContested) {
        if (p.sold_to_team_id) {
          winsByTeam.set(p.sold_to_team_id, (winsByTeam.get(p.sold_to_team_id) ?? 0) + 1)
        }
      }
      let topTeamId = ''
      let topWins = 0
      winsByTeam.forEach((wins, teamId) => {
        if (wins > topWins) {
          topWins = wins
          topTeamId = teamId
        }
      })
      const dominantTeam = teamMap.get(topTeamId)
      if (dominantTeam && topWins > 0) {
        stats.push({
          emoji: '🏆',
          label: 'Dominant Bidder',
          value: dominantTeam.name,
          sub: `Won ${topWins} highly contested auction${topWins !== 1 ? 's' : ''}`,
        })
      }
    }
  }

  return stats
}
