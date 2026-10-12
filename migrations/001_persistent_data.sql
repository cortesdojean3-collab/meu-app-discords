CREATE TABLE IF NOT EXISTS papo_schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS papo_users (
  user_key text PRIMARY KEY,
  uid uuid NOT NULL UNIQUE,
  name text NOT NULL,
  salt text NOT NULL,
  password_hash text NOT NULL,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS papo_profiles (
  uid uuid PRIMARY KEY REFERENCES papo_users(uid) ON DELETE CASCADE,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS papo_sessions (
  token_hash text PRIMARY KEY,
  uid uuid NOT NULL REFERENCES papo_users(uid) ON DELETE CASCADE,
  remember boolean NOT NULL DEFAULT false,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL,
  user_agent text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS papo_sessions_uid_idx ON papo_sessions(uid);
CREATE INDEX IF NOT EXISTS papo_sessions_expiry_idx ON papo_sessions(expires_at);

CREATE TABLE IF NOT EXISTS papo_messages (
  id text PRIMARY KEY,
  channel text NOT NULL,
  author_uid uuid NOT NULL REFERENCES papo_users(uid) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS papo_messages_channel_time_idx ON papo_messages(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS papo_messages_author_idx ON papo_messages(author_uid);

INSERT INTO papo_schema_migrations(version) VALUES (1) ON CONFLICT (version) DO NOTHING;
