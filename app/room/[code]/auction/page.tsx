'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { useRoom } from '@/lib/hooks/useRoom'
import { useTeams } from '@/lib/hooks/useTeams'
import { useAuctionState } from '@/lib/hooks/useAuctionState'
import { useBids } from '@/lib/hooks/useBids'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { useCountdown } from '@/lib/hooks/useCountdown'
import { useAuctionHistory } from '@/lib/hooks/useAuctionHistory'
import { PlayerCard } from '@/components/auction/PlayerCard'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { BidPanel } from '@/components/auction/BidPanel'
import { BidHistory } from '@/components/auction/BidHistory'
import { AuctionHistory } from '@/components/auction/AuctionHistory'
import { TeamSidebar } from '@/components/auction/TeamSidebar'
import { SquadDisplay } from '@/components/auction/SquadDisplay'
import { AdminControls } from '@/components/auction/AdminControls'
import { TeamCompositionRules } from '@/components/auction/TeamCompositionRules'
import { playBid, playSold, playUnsold, playNewPlayer, playNewCategory } from '@/lib/utils/sounds'

export default function AuctionPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()
  const router = useRouter()

  const [session, setSession] = useState<{ teamId: string; joinToken: string; isAdmin: boolean } | null>(null)
  const { room } = useRoom(code)
  const { teams } = useTeams(room?.id ?? null)
  const { auctionState, currentPlayer } = useAuctionState(room?.id ?? null)
  const bids = useBids(room?.id ?? null, auctionState?.current_player_id)
  const { players } = usePlayers(room?.id ?? null)
  const auctionHistory = useAuctionHistory(room?.id ?? null)
  const [rightTab, setRightTab] = useState<'bids' | 'history'>('bids')
  const [mobileTab, setMobileTab] = useState<'auction' | 'teams' | 'bids'>('auction')
  const [seenHistoryCount, setSeenHistoryCount] = useState(0)
  const unseenHistoryCount = auctionHistory.length - seenHistoryCount

  function switchTab(tab: 'bids' | 'history') {
    setRightTab(tab)
    if (tab === 'history') setSeenHistoryCount(auctionHistory.length)
  }

  const isPaused = auctionState?.paused ?? false

  const timerRemaining = useCountdown(
    auctionState?.timer_started_at ?? null,
    room?.timer_duration ?? 30,
    isPaused,
    auctionState?.paused_at ?? null
  )

  const [playerResolved, setPlayerResolved] = useState(false)

  useEffect(() => {
    const s = getSession(code)
    if (!s) {
      router.replace(`/room/${code}`)
      return
    }
    setSession(s)
  }, [code, router])

  // Navigate to results when room finishes
  useEffect(() => {
    if (room?.status === 'finished') {
      router.push(`/room/${code}/results`)
    }
  }, [room?.status, code, router])

  // Reset playerResolved when player changes
  useEffect(() => {
    setPlayerResolved(false)
  }, [auctionState?.current_player_id])

  // Detect if current player is resolved
  useEffect(() => {
    if (currentPlayer && (currentPlayer.status === 'sold' || currentPlayer.status === 'unsold')) {
      setPlayerResolved(true)
    }
  }, [currentPlayer?.status])

  // Sound: new player / new category
  const prevPlayerIdRef = useRef<string | null>(null)
  const prevPlayerRoleRef = useRef<string | null>(null)
  useEffect(() => {
    const id = auctionState?.current_player_id ?? null
    if (!id || id === prevPlayerIdRef.current) return
    const role = currentPlayer?.role ?? null
    if (prevPlayerIdRef.current !== null && role !== prevPlayerRoleRef.current) {
      playNewCategory()
    } else if (prevPlayerIdRef.current !== null) {
      playNewPlayer()
    }
    prevPlayerIdRef.current = id
    prevPlayerRoleRef.current = role
  }, [auctionState?.current_player_id, currentPlayer?.role])

  // Sound: bid placed (bids array grows)
  const prevBidCountRef = useRef<number>(0)
  useEffect(() => {
    if (bids.length > prevBidCountRef.current) {
      if (prevBidCountRef.current > 0) playBid()
      prevBidCountRef.current = bids.length
    } else if (bids.length === 0) {
      prevBidCountRef.current = 0
    }
  }, [bids.length])

  // Sound: sold / unsold
  useEffect(() => {
    if (currentPlayer?.status === 'sold') playSold()
    else if (currentPlayer?.status === 'unsold') playUnsold()
  }, [currentPlayer?.status])

  const myTeam = teams.find((t) => t.id === session?.teamId)
  const leadingTeam = teams.find((t) => t.id === auctionState?.current_bid_team_id) ?? null
  const timerExpired = timerRemaining === 0 && !!auctionState?.timer_started_at

  // Determine the next category coming up after the current chunk
  const nextCategory = (() => {
    if (!currentPlayer) return null
    const pending = players
      .filter((p) => p.status === 'pending')
      .sort((a, b) => a.queue_position - b.queue_position)
    const nextPlayer = pending[0] ?? null
    if (!nextPlayer || nextPlayer.role === currentPlayer.role) return null
    return nextPlayer.role
  })()

  const pendingCount = players.filter((p) => p.status === 'pending').length

  async function handleBid(amount: number) {
    const res = await fetch('/api/auction/bid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({
        roomCode: code,
        playerId: auctionState?.current_player_id,
        amount,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? 'Bid failed')
    }
  }

  async function handleSold() {
    const res = await fetch('/api/auction/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code, resolution: 'sold' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
    setPlayerResolved(true)
  }

  async function handleUnsold() {
    const res = await fetch('/api/auction/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code, resolution: 'unsold' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
    setPlayerResolved(true)
  }

  async function handleNext() {
    const res = await fetch('/api/auction/next', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
  }

  async function handleEndAuction() {
    const res = await fetch('/api/auction/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
  }

  async function handlePause() {
    const res = await fetch('/api/auction/pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code, action: 'pause' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
  }

  async function handleUnpause() {
    const res = await fetch('/api/auction/pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ roomCode: code, action: 'unpause' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed')
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-black text-yellow-400 font-mono">{code}</h1>
          <span className="text-gray-500 text-sm">
            {pendingCount} remaining
          </span>
        </div>
        {myTeam && (
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: myTeam.color }} />
            <span className="text-sm font-bold" style={{ color: myTeam.color }}>{myTeam.name}</span>
          </div>
        )}
      </div>

      {/* Desktop 3-column layout (hidden on mobile) */}
      <div className="flex-1 hidden lg:grid lg:grid-cols-[280px_1fr_220px] gap-0 overflow-hidden">
        {/* Left: Team Sidebar + Squad Display */}
        <div className="flex flex-col p-4 border-r border-gray-800 overflow-y-auto gap-0">
          <TeamSidebar
            teams={teams}
            players={players}
            myTeamId={myTeam?.id ?? null}
          />
          <SquadDisplay
            teams={teams}
            players={players}
            myTeamId={myTeam?.id ?? null}
          />
        </div>

        {/* Center: Auction Stage */}
        <div className="flex flex-col items-center justify-center p-4 gap-4 overflow-y-auto">
          {isPaused && (
            <div className="w-full max-w-md bg-yellow-500 text-black font-black text-center py-2 px-4 rounded-xl text-lg animate-pulse">
              ⏸ AUCTION PAUSED
            </div>
          )}
          {currentPlayer ? (
            <>
              <CountdownTimer
                timerStartedAt={auctionState?.timer_started_at ?? null}
                timerDuration={room?.timer_duration ?? 30}
                paused={isPaused}
                pausedAt={auctionState?.paused_at ?? null}
              />
              <TeamCompositionRules players={players} myTeamId={myTeam?.id ?? null} />
              <div className="w-full max-w-md">
                <PlayerCard
                  player={currentPlayer}
                  currentBid={auctionState?.current_bid_amount ?? currentPlayer.base_price}
                  leadingTeam={leadingTeam}
                />
              </div>
              {nextCategory && (
                <div className="w-full max-w-md bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Coming up next</span>
                  <span className="text-sm font-black text-yellow-300">
                    {nextCategory === 'All-Rounder' ? 'All-Rounders' : `${nextCategory}s`}
                  </span>
                </div>
              )}
              {!playerResolved && myTeam && (
                <div className="w-full max-w-md">
                  <BidPanel
                    currentBid={auctionState?.current_bid_amount ?? currentPlayer.base_price}
                    myBudget={myTeam.budget_remaining}
                    timerExpired={timerExpired}
                    paused={isPaused}
                    onBid={handleBid}
                  />
                </div>
              )}
              {session.isAdmin && (
                <div className="w-full max-w-md">
                  <AdminControls
                    onSold={handleSold}
                    onUnsold={handleUnsold}
                    onNext={handleNext}
                    onPause={handlePause}
                    onUnpause={handleUnpause}
                    onEndAuction={handleEndAuction}
                    resolved={playerResolved}
                    paused={isPaused}
                    hasBids={bids.length > 0}
                  />
                </div>
              )}
              {playerResolved && currentPlayer.status === 'sold' && (
                <div className="text-center">
                  <p className="text-2xl font-black text-green-400">SOLD</p>
                  <p className="text-gray-400 text-sm">to {leadingTeam?.name ?? 'Unknown'}</p>
                </div>
              )}
              {playerResolved && currentPlayer.status === 'unsold' && (
                <div className="text-center">
                  <p className="text-2xl font-black text-red-400">UNSOLD</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-500">
              <p className="text-4xl mb-2">⏳</p>
              <p>Waiting for next player...</p>
            </div>
          )}
        </div>

        {/* Right: Bid History + Auction Log tabs */}
        <div className="flex flex-col border-l border-gray-800 overflow-hidden" style={{ maxHeight: 'calc(100vh - 53px)' }}>
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => switchTab('bids')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                rightTab === 'bids' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Current Bids
            </button>
            <button
              onClick={() => switchTab('history')}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${
                rightTab === 'history' ? 'text-white border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Auction Log
              {unseenHistoryCount > 0 && (
                <span className="ml-1 bg-yellow-500 text-black text-xs rounded-full px-1.5 py-0.5 font-black">
                  {unseenHistoryCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            {rightTab === 'bids' ? (
              <BidHistory
                bids={bids}
                timerStartedAt={auctionState?.timer_started_at}
                timerDuration={room?.timer_duration ?? 30}
                paused={isPaused}
              />
            ) : (
              <AuctionHistory history={auctionHistory} />
            )}
          </div>
        </div>
      </div>

      {/* Mobile layout (hidden on desktop) */}
      <div className="flex-1 flex flex-col lg:hidden overflow-hidden">
        {isPaused && (
          <div className="bg-yellow-500 text-black font-black text-center py-2 px-4 text-sm animate-pulse">
            ⏸ AUCTION PAUSED
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {mobileTab === 'auction' && (
            <div className="flex flex-col items-center p-3 gap-3">
              {currentPlayer ? (
                <>
                  <CountdownTimer
                    timerStartedAt={auctionState?.timer_started_at ?? null}
                    timerDuration={room?.timer_duration ?? 30}
                    paused={isPaused}
                    pausedAt={auctionState?.paused_at ?? null}
                  />
                  <TeamCompositionRules players={players} myTeamId={myTeam?.id ?? null} />
                  <div className="w-full">
                    <PlayerCard
                      player={currentPlayer}
                      currentBid={auctionState?.current_bid_amount ?? currentPlayer.base_price}
                      leadingTeam={leadingTeam}
                    />
                  </div>
                  {nextCategory && (
                    <div className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Coming up next</span>
                      <span className="text-sm font-black text-yellow-300">
                        {nextCategory === 'All-Rounder' ? 'All-Rounders' : `${nextCategory}s`}
                      </span>
                    </div>
                  )}
                  {!playerResolved && myTeam && (
                    <div className="w-full">
                      <BidPanel
                        currentBid={auctionState?.current_bid_amount ?? currentPlayer.base_price}
                        myBudget={myTeam.budget_remaining}
                        timerExpired={timerExpired}
                        paused={isPaused}
                        onBid={handleBid}
                      />
                    </div>
                  )}
                  {session.isAdmin && (
                    <div className="w-full">
                      <AdminControls
                        onSold={handleSold}
                        onUnsold={handleUnsold}
                        onNext={handleNext}
                        onPause={handlePause}
                        onUnpause={handleUnpause}
                        onEndAuction={handleEndAuction}
                        resolved={playerResolved}
                        paused={isPaused}
                        hasBids={bids.length > 0}
                      />
                    </div>
                  )}
                  {playerResolved && currentPlayer.status === 'sold' && (
                    <div className="text-center">
                      <p className="text-2xl font-black text-green-400">SOLD</p>
                      <p className="text-gray-400 text-sm">to {leadingTeam?.name ?? 'Unknown'}</p>
                    </div>
                  )}
                  {playerResolved && currentPlayer.status === 'unsold' && (
                    <div className="text-center">
                      <p className="text-2xl font-black text-red-400">UNSOLD</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-500 pt-16">
                  <p className="text-4xl mb-2">⏳</p>
                  <p>Waiting for next player...</p>
                </div>
              )}
            </div>
          )}

          {mobileTab === 'teams' && (
            <div className="p-3">
              <TeamSidebar teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
              <SquadDisplay teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
            </div>
          )}

          {mobileTab === 'bids' && (
            <div className="flex flex-col h-full">
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => switchTab('bids')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                    rightTab === 'bids' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500'
                  }`}
                >
                  Current Bids
                </button>
                <button
                  onClick={() => switchTab('history')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${
                    rightTab === 'history' ? 'text-white border-b-2 border-yellow-500' : 'text-gray-500'
                  }`}
                >
                  Auction Log
                  {unseenHistoryCount > 0 && (
                    <span className="ml-1 bg-yellow-500 text-black text-xs rounded-full px-1.5 py-0.5 font-black">
                      {unseenHistoryCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {rightTab === 'bids' ? (
                  <BidHistory
                    bids={bids}
                    timerStartedAt={auctionState?.timer_started_at}
                    timerDuration={room?.timer_duration ?? 30}
                    paused={isPaused}
                  />
                ) : (
                  <AuctionHistory history={auctionHistory} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile bottom nav */}
        <div className="border-t border-gray-800 bg-gray-900 grid grid-cols-3 shrink-0">
          {(['auction', 'teams', 'bids'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`py-3.5 text-xs font-bold transition-colors capitalize border-t-2 relative ${
                mobileTab === tab
                  ? 'text-yellow-400 border-yellow-400'
                  : 'text-gray-500 border-transparent'
              }`}
            >
              {tab}
              {tab === 'bids' && unseenHistoryCount > 0 && mobileTab !== 'bids' && (
                <span className="ml-1 bg-yellow-500 text-black text-[10px] rounded-full px-1 font-black">
                  {unseenHistoryCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
