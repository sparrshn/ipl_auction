'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getSession, saveSession } from '@/lib/session'
import { OWNERS } from '@/lib/config/retentions'

export default function JoinRoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()
  const router = useRouter()

  const [teamName, setTeamName] = useState('')
  const [owner, setOwner] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [isAdminJoin, setIsAdminJoin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  // Check if already joined
  useEffect(() => {
    const session = getSession(code)
    if (session) {
      router.replace(`/room/${code}/lobby`)
      return
    }
    setChecking(false)
  }, [code, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!teamName.trim()) {
      setError('Team name is required')
      return
    }

    if (!owner) {
      setError('Please select your name')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          owner,
          adminPassword: isAdminJoin ? adminPassword : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to join room')
        return
      }

      saveSession(code, {
        teamId: data.teamId,
        joinToken: data.joinToken,
        isAdmin: data.isAdmin,
      })

      router.push(`/room/${code}/lobby`)
    } catch {
      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 px-4">
      <div className="mb-6 text-center">
        <p className="text-gray-400 text-sm">Joining room</p>
        <h1 className="text-4xl font-black text-white font-mono tracking-widest">{code}</h1>
      </div>

      <form onSubmit={handleJoin} className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
        <h2 className="text-xl font-bold text-white">Pick Your Team</h2>
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div>
          <label className="block text-sm text-gray-400 mb-1">Your Name</label>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
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
          <label className="block text-sm text-gray-400 mb-1">Team Name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            placeholder="e.g. Chennai Super Kings"
            maxLength={50}
            required
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAdminJoin}
            onChange={(e) => setIsAdminJoin(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-gray-400">I am the admin</span>
        </label>

        {isAdminJoin && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Admin Password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="Enter admin password"
              required={isAdminJoin}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
        >
          {loading ? 'Joining...' : 'Join Room'}
        </button>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-300 transition-colors">
          Back to home
        </a>
      </form>
    </div>
  )
}
