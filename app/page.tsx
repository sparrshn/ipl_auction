'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { OWNERS } from '@/lib/config/retentions'

export default function LandingPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')

  // Create room state
  const [adminTeamName, setAdminTeamName] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminOwner, setAdminOwner] = useState('')

  // Join room state
  const [joinCode, setJoinCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!adminTeamName.trim() || !adminPassword.trim() || !adminOwner) {
      setError('Team name, owner, and admin password are required')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, adminTeamName, adminOwner }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create room')
        return
      }
      // Save session
      localStorage.setItem(
        `ipl_auction_session_${data.roomCode}`,
        JSON.stringify({ teamId: data.teamId, joinToken: data.joinToken, isAdmin: true })
      )
      router.push(`/room/${data.roomCode}/lobby`)
    } catch {
      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError('Room code must be 6 characters')
      return
    }
    router.push(`/room/${code}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-black text-white tracking-tight">
          IPL <span className="text-yellow-400">Auction</span>
        </h1>
        <p className="mt-2 text-gray-400">Real-time auction for 5 friends</p>
      </div>

      {mode === 'choose' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => setMode('create')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg transition-colors"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-lg transition-colors border border-gray-600"
          >
            Join Room
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreate} className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <h2 className="text-xl font-bold text-white">Create a Room</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Name</label>
            <select
              value={adminOwner}
              onChange={(e) => setAdminOwner(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              required
            >
              <option value="">Select your name...</option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Team Name</label>
            <input
              type="text"
              value={adminTeamName}
              onChange={(e) => setAdminTeamName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. Mumbai Indians"
              maxLength={50}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Admin Password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="Secret password for admin controls"
              minLength={4}
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('choose'); setError('') }}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={handleJoin} className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <h2 className="text-xl font-bold text-white">Join a Room</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Room Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 tracking-widest text-center text-2xl font-mono font-bold uppercase"
              placeholder="ABC123"
              maxLength={6}
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('choose'); setError('') }}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
            >
              Join
            </button>
          </div>
        </form>
      )}

      <p className="mt-8 text-gray-600 text-xs">
        Share the 6-char room code with your friends after creating a room
      </p>
    </div>
  )
}
