export type RoomStatus = 'waiting' | 'active' | 'finished'
export type PlayerStatus = 'pending' | 'active' | 'sold' | 'unsold'
export type PlayerRole = 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper'

export interface Room {
  id: string
  code: string
  admin_password: string
  budget_per_team: number
  timer_duration: number
  status: RoomStatus
  created_at: string
}

export interface Team {
  id: string
  room_id: string
  name: string
  color: string
  budget_remaining: number
  is_admin: boolean
  join_token: string
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  nationality: string | null
  role: PlayerRole | null
  ipl_team: string | null
  uncapped: boolean
  is_captain: boolean
  base_price: number
  status: PlayerStatus
  sold_to_team_id: string | null
  final_price: number | null
  queue_position: number
  created_at: string
}

export interface Bid {
  id: string
  room_id: string
  player_id: string
  team_id: string
  amount: number
  placed_at: string
  // joined
  team?: Team
}

export interface AuctionState {
  id: string
  room_id: string
  current_player_id: string | null
  current_bid_amount: number
  current_bid_team_id: string | null
  timer_started_at: string | null
  paused: boolean
  paused_at: string | null
  updated_at: string
}

// Session stored in localStorage
export interface SessionData {
  teamId: string
  joinToken: string
  isAdmin: boolean
}
