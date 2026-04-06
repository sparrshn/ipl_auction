'use client'

import { useState } from 'react'

interface Props {
  onSold: () => Promise<void>
  onUnsold: () => Promise<void>
  onNext: () => Promise<void>
  onPause: () => Promise<void>
  onUnpause: () => Promise<void>
  onEndAuction: () => Promise<void>
  resolved: boolean
  paused: boolean
  hasBids: boolean
}

export function AdminControls({ onSold, onUnsold, onNext, onPause, onUnpause, onEndAuction, resolved, paused, hasBids }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmUnsold, setConfirmUnsold] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  async function handle(fn: () => Promise<void>) {
    setError('')
    setLoading(true)
    try {
      await fn()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  function handleUnsoldClick() {
    if (hasBids) {
      setConfirmUnsold(true)
    } else {
      handle(onUnsold)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Admin Controls</p>
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Pause / Unpause */}
      <button
        onClick={() => handle(paused ? onUnpause : onPause)}
        disabled={loading || resolved}
        className={`w-full py-2.5 font-bold rounded-lg transition-colors disabled:opacity-40 ${
          paused
            ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
      >
        {paused ? '▶ Resume Auction' : '⏸ Pause Auction'}
      </button>

      {!resolved && !confirmUnsold && (
        <div className="flex gap-3">
          <button
            onClick={() => handle(onSold)}
            disabled={loading || paused}
            className="flex-1 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
          >
            Mark Sold
          </button>
          <button
            onClick={handleUnsoldClick}
            disabled={loading || paused}
            className="flex-1 py-2.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
          >
            Mark Unsold
          </button>
        </div>
      )}

      {!resolved && confirmUnsold && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-3 space-y-2">
          <p className="text-red-300 text-sm font-bold text-center">Bids exist — mark unsold anyway?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmUnsold(false)}
              disabled={loading}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmUnsold(false); handle(onUnsold) }}
              disabled={loading}
              className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Yes, Unsold
            </button>
          </div>
        </div>
      )}

      {resolved && (
        <button
          onClick={() => handle(onNext)}
          disabled={loading}
          className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
        >
          Next Player →
        </button>
      )}

      {/* End Auction */}
      {!confirmEnd ? (
        <button
          onClick={() => setConfirmEnd(true)}
          disabled={loading}
          className="w-full py-2 bg-gray-800 hover:bg-red-950 border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
        >
          End Auction Early
        </button>
      ) : (
        <div className="bg-red-950 border border-red-700 rounded-lg p-3 space-y-2">
          <p className="text-red-300 text-sm font-bold text-center">End auction for everyone?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmEnd(false)}
              disabled={loading}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmEnd(false); handle(onEndAuction) }}
              disabled={loading}
              className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Yes, End It
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
