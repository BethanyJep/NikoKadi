-- NikoKadi Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database.

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_id UUID NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INT DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE room_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  is_host BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE game_state (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  version INT DEFAULT 1
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_user ON room_players(user_id);

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- rooms: any authenticated user can read/create; only host can update
CREATE POLICY "rooms_select" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "rooms_insert" ON rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "rooms_update" ON rooms
  FOR UPDATE USING (auth.uid() = host_id);

-- room_players: anyone can read; only own entries for insert/delete
CREATE POLICY "room_players_select" ON room_players
  FOR SELECT USING (true);

CREATE POLICY "room_players_insert" ON room_players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "room_players_delete" ON room_players
  FOR DELETE USING (auth.uid() = user_id);

-- game_state: any authenticated user can read/write
-- Turn enforcement is handled client-side.
CREATE POLICY "game_state_select" ON game_state
  FOR SELECT USING (true);

CREATE POLICY "game_state_insert" ON game_state
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "game_state_update" ON game_state
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ── Enable Realtime ─────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
