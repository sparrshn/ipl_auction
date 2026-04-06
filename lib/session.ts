import type { SessionData } from './supabase/types'

const SESSION_KEY_PREFIX = 'ipl_auction_session_'

export function getSession(roomCode: string): SessionData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${SESSION_KEY_PREFIX}${roomCode}`)
    if (!raw) return null
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

export function saveSession(roomCode: string, data: SessionData): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${SESSION_KEY_PREFIX}${roomCode}`, JSON.stringify(data))
}

export function clearSession(roomCode: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`${SESSION_KEY_PREFIX}${roomCode}`)
}
