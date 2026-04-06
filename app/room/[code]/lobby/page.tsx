'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { useRoom } from '@/lib/hooks/useRoom'
import { useTeams } from '@/lib/hooks/useTeams'
import { usePlayers } from '@/lib/hooks/usePlayers'
import { parseCsvText } from '@/lib/utils/csv-parser'
import { formatPrice, parsePrice } from '@/lib/utils/currency'

const TEAM_LIMIT = 5

export default function LobbyPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()
  const router = useRouter()

  const [session, setSession] = useState<{ teamId: string; joinToken: string; isAdmin: boolean } | null>(null)
  const { room } = useRoom(code)
  const { teams } = useTeams(room?.id ?? null)
  const { players } = usePlayers(room?.id ?? null)

  const [csvError, setCsvError] = useState('')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvSuccess, setCsvSuccess] = useState('')

  const [budget, setBudget] = useState('')
  const [timer, setTimer] = useState('')
  const [settingsMsg, setSettingsMsg] = useState('')

  const [startLoading, setStartLoading] = useState(false)
  const [startError, setStartError] = useState('')

  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    const s = getSession(code)
    if (!s) {
      router.replace(`/room/${code}`)
      return
    }
    setSession(s)
    setShareUrl(`${window.location.origin}/room/${code}`)
  }, [code, router])

  useEffect(() => {
    if (room) {
      setBudget(String(room.budget_per_team / 10_000_000)) // in crores
      setTimer(String(room.timer_duration))
    }
  }, [room])

  // Navigate to auction when room goes active
  useEffect(() => {
    if (room?.status === 'active') {
      router.push(`/room/${code}/auction`)
    }
  }, [room?.status, code, router])

  const myTeam = teams.find((t) => t.id === session?.teamId)

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError('')
    setCsvSuccess('')
    setCsvLoading(true)
    try {
      // Parse client-side just for validation/preview
      const csvText = await file.text()
      const { players: parsed, errors } = parseCsvText(csvText)
      if (parsed.length === 0) {
        setCsvError(errors.join('; '))
        return
      }

      // Send the original raw CSV text — don't re-serialize to avoid double-conversion
      const res = await fetch(`/api/rooms/${code}/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-join-token': session!.joinToken,
        },
        body: JSON.stringify({ csvText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCsvError(data.error ?? 'Upload failed')
        return
      }
      setCsvSuccess(`${data.count} players uploaded`)
      if (data.warnings?.length) {
        setCsvError(`Warnings: ${data.warnings.join('; ')}`)
      }
    } catch {
      setCsvError('Failed to parse file')
    } finally {
      setCsvLoading(false)
      e.target.value = ''
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsMsg('')
    const budgetRupees = parseFloat(budget) * 10_000_000
    const timerSec = parseInt(timer)

    const res = await fetch(`/api/rooms/${code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-join-token': session!.joinToken,
      },
      body: JSON.stringify({ budgetPerTeam: budgetRupees, timerDuration: timerSec }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSettingsMsg(data.error ?? 'Failed to save')
      return
    }
    setSettingsMsg('Settings saved!')
  }

  async function handleStartAuction() {
    setStartError('')
    if (players.length === 0) {
      setStartError('Upload players first')
      return
    }
    if (teams.length < 2) {
      setStartError('At least 2 teams must join')
      return
    }
    setStartLoading(true)
    try {
      const res = await fetch('/api/auction/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-join-token': session!.joinToken,
        },
        body: JSON.stringify({ roomCode: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStartError(data.error ?? 'Failed to start')
      }
      // Room status update via realtime will trigger navigation
    } finally {
      setStartLoading(false)
    }
  }

  const copyShareUrl = useCallback(() => {
    navigator.clipboard.writeText(shareUrl)
  }, [shareUrl])

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-gray-400 text-sm">Room Code</p>
            <h1 className="text-3xl font-black font-mono tracking-widest text-yellow-400">{code}</h1>
          </div>
          {myTeam && (
            <div className="text-right">
              <p className="text-gray-400 text-sm">Your Team</p>
              <p className="font-bold text-lg" style={{ color: myTeam.color }}>{myTeam.name}</p>
              {myTeam.is_admin && <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">ADMIN</span>}
            </div>
          )}
        </div>

        {/* Share link */}
        <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-800">
          <p className="text-sm text-gray-400 mb-2">Share this link with friends:</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm text-blue-300 truncate">{shareUrl}</code>
            <button
              onClick={copyShareUrl}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Teams list */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              Teams
              <span className="text-sm text-gray-500 font-normal">({teams.length}/{TEAM_LIMIT})</span>
            </h2>
            <div className="space-y-2">
              {teams.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="font-medium">{t.name}</span>
                  {t.is_admin && <span className="ml-auto text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">ADMIN</span>}
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-gray-600 text-sm">Waiting for players to join...</p>
              )}
              {teams.length < TEAM_LIMIT && (
                <p className="text-gray-600 text-sm">
                  {TEAM_LIMIT - teams.length} spot{TEAM_LIMIT - teams.length !== 1 ? 's' : ''} remaining
                </p>
              )}
            </div>
          </div>

          {/* Admin: CSV upload + settings */}
          {session.isAdmin && (
            <div className="space-y-4">
              {/* CSV Upload */}
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <h2 className="font-bold text-lg mb-3">Players</h2>
                <p className="text-sm text-gray-400 mb-3">
                  Upload a CSV with columns: <code className="text-blue-400">name, nationality, role, base_price</code>
                </p>
                <a
                  href="/sample-players.csv"
                  download
                  className="text-xs text-blue-400 hover:underline mb-3 block"
                >
                  Download sample CSV
                </a>
                <label className="block cursor-pointer">
                  <span className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
                    {csvLoading ? 'Uploading...' : 'Choose CSV file'}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    disabled={csvLoading}
                    className="hidden"
                  />
                </label>
                {csvSuccess && <p className="text-green-400 text-sm mt-2">{csvSuccess}</p>}
                {csvError && <p className="text-red-400 text-sm mt-2">{csvError}</p>}
                {players.length > 0 && (
                  <p className="text-gray-400 text-sm mt-2">{players.length} players in queue</p>
                )}
              </div>

              {/* Settings */}
              <form onSubmit={handleSaveSettings} className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-3">
                <h2 className="font-bold text-lg">Settings</h2>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Budget per Team (in Crores)</label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    min={10}
                    max={10000}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Timer per Player (seconds)</label>
                  <input
                    type="number"
                    value={timer}
                    onChange={(e) => setTimer(e.target.value)}
                    min={10}
                    max={120}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  Save Settings
                </button>
                {settingsMsg && (
                  <p className={`text-sm ${settingsMsg.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>
                    {settingsMsg}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Non-admin: players preview */}
          {!session.isAdmin && players.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="font-bold text-lg mb-3">Players ({players.length})</h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {players.slice(0, 20).map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1 border-b border-gray-800">
                    <span className="text-gray-300">{p.name}</span>
                    <span className="text-yellow-400">{formatPrice(p.base_price)}</span>
                  </div>
                ))}
                {players.length > 20 && (
                  <p className="text-gray-600 text-xs mt-2">+{players.length - 20} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Start button (admin only) */}
        {session.isAdmin && (
          <div className="mt-8 text-center">
            {startError && <p className="text-red-400 text-sm mb-3">{startError}</p>}
            <button
              onClick={handleStartAuction}
              disabled={startLoading || players.length === 0}
              className="px-10 py-4 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xl rounded-2xl transition-colors shadow-lg shadow-green-900"
            >
              {startLoading ? 'Starting...' : 'Start Auction'}
            </button>
            {players.length === 0 && (
              <p className="text-gray-500 text-sm mt-2">Upload players to enable</p>
            )}
          </div>
        )}

        {/* Non-admin waiting */}
        {!session.isAdmin && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Waiting for admin to start the auction...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
