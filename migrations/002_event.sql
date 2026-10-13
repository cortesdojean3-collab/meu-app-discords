CREATE TABLE IF NOT EXISTS papo_event_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  config jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES papo_users(uid) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS papo_event_admins (
  uid uuid PRIMARY KEY REFERENCES papo_users(uid) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- A deleted account leaves this binding empty. A later account with the same
-- username must never inherit administrative access.
CREATE TABLE IF NOT EXISTS papo_event_admin_bootstrap (
  source text PRIMARY KEY,
  uid uuid REFERENCES papo_users(uid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS papo_event_discoveries (
  uid uuid NOT NULL REFERENCES papo_users(uid) ON DELETE CASCADE,
  kind text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, kind)
);

INSERT INTO papo_schema_migrations(version) VALUES (4) ON CONFLICT (version) DO NOTHING;
