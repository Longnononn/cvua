CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  email TEXT,
  rating INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  white_player_id INTEGER,
  black_player_id INTEGER,
  pgn TEXT,
  result TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_player_id);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  to_user_id INTEGER NOT NULL,
  from_user_id INTEGER NOT NULL,
  from_username TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_to_user ON invites(to_user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
