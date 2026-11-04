import type { MigrationEntry } from "@agent-native/core/db";

/** Additive, named migrations. Append new entries; never edit an applied one. */
export const MIGRATIONS: MigrationEntry[] = [
    {
      version: 1,
      name: "contests-and-steps",
      sql: `CREATE TABLE IF NOT EXISTS contests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  prize_usd INTEGER NOT NULL DEFAULT 0,
  deadline_utc TEXT NOT NULL,
  deadline_zone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'scouting' CHECK (status IN ('scouting','eligible','building','submitted','skipped')),
  free BOOLEAN NOT NULL DEFAULT TRUE,
  solo_ok BOOLEAN NOT NULL DEFAULT TRUE,
  ai_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  effort_hours INTEGER NOT NULL DEFAULT 8,
  fit_score INTEGER,
  requirements TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS contest_steps (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  owner_email TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contests_owner_deadline_idx ON contests (owner_email, deadline_utc);
CREATE INDEX IF NOT EXISTS contest_steps_contest_idx ON contest_steps (contest_id, position)`,
    },
  ];
