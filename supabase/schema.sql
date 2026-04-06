-- IPL Auction Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- TABLES
-- =============================================

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  admin_password VARCHAR(255) NOT NULL,
  budget_per_team BIGINT NOT NULL DEFAULT 10000000, -- 1 Crore in rupees
  timer_duration INTEGER NOT NULL DEFAULT 30, -- seconds
  status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting, active, finished
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  owner VARCHAR(50), -- real person name (Sparrsh/Kathan/Aditya/Sanjay/Kaushal)
  color VARCHAR(7) NOT NULL DEFAULT '#3B82F6', -- hex color
  budget_remaining BIGINT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  join_token VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, name),
  UNIQUE(room_id, owner)
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  nationality VARCHAR(100),
  role VARCHAR(50), -- Batsman, Bowler, All-Rounder, Wicket-Keeper
  ipl_team VARCHAR(10), -- CSK, MI, RCB, etc.
  uncapped BOOLEAN NOT NULL DEFAULT FALSE,
  is_captain BOOLEAN NOT NULL DEFAULT FALSE,
  base_price BIGINT NOT NULL, -- in rupees
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, active, sold, unsold
  sold_to_team_id UUID REFERENCES teams(id),
  final_price BIGINT,
  queue_position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auction_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  current_player_id UUID REFERENCES players(id),
  current_bid_amount BIGINT NOT NULL DEFAULT 0,
  current_bid_team_id UUID REFERENCES teams(id),
  timer_started_at TIMESTAMPTZ,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_teams_room_id ON teams(room_id);
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_players_queue_position ON players(room_id, queue_position);
CREATE INDEX idx_bids_player_id ON bids(player_id);
CREATE INDEX idx_bids_room_id ON bids(room_id);
CREATE INDEX idx_bids_placed_at ON bids(room_id, placed_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_state ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT only (reads go through anon key on client)
CREATE POLICY "anon_select_rooms" ON rooms FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_teams" ON teams FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_players" ON players FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_bids" ON bids FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_auction_state" ON auction_state FOR SELECT TO anon USING (true);

-- Service role bypasses RLS (all writes happen server-side via service role key)
-- No additional policies needed for service_role as it bypasses RLS by default

-- =============================================
-- REALTIME
-- =============================================

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE auction_state;

-- =============================================
-- PLACE BID RPC (atomic, race-condition safe)
-- =============================================

CREATE OR REPLACE FUNCTION place_bid(
  p_room_id UUID,
  p_player_id UUID,
  p_team_id UUID,
  p_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state auction_state%ROWTYPE;
  v_team teams%ROWTYPE;
  v_player players%ROWTYPE;
  v_room rooms%ROWTYPE;
  v_timer_end TIMESTAMPTZ;
BEGIN
  -- Lock auction_state row to prevent race conditions
  SELECT * INTO v_state
  FROM auction_state
  WHERE room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction state not found');
  END IF;

  -- Check correct player
  IF v_state.current_player_id IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wrong player - auction has moved on');
  END IF;

  IF v_state.paused THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction is paused');
  END IF;

  -- Check timer not expired
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
  v_timer_end := v_state.timer_started_at + (v_room.timer_duration::text || ' seconds')::INTERVAL;
  IF NOW() > v_timer_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timer has expired');
  END IF;

  -- Get player
  SELECT * INTO v_player FROM players WHERE id = p_player_id;
  IF v_player.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player is not active');
  END IF;

  -- Get team
  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Validate bid amount
  IF p_amount <= v_state.current_bid_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be higher than current bid');
  END IF;

  IF p_amount < v_player.base_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid below base price');
  END IF;

  IF p_amount > v_team.budget_remaining THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget');
  END IF;

  -- Record the bid
  INSERT INTO bids (room_id, player_id, team_id, amount)
  VALUES (p_room_id, p_player_id, p_team_id, p_amount);

  -- Update auction state
  UPDATE auction_state
  SET
    current_bid_amount = p_amount,
    current_bid_team_id = p_team_id,
    timer_started_at = NOW(),
    updated_at = NOW()
  WHERE room_id = p_room_id;

  RETURN jsonb_build_object('success', true, 'amount', p_amount);
END;
$$;

-- Grant execute to anon and authenticated (called via API routes with service role)
GRANT EXECUTE ON FUNCTION place_bid TO service_role;
