-- ═══════════════════════════════════════════════════════════════
--  Team Sales CRM — schema
--
--  Two ideas shape this file:
--
--  1. Everything an admin can edit (statuses, sources, priorities,
--     activity types, outcomes) lives in its own table, never in
--     application code.
--
--  2. Analytics cannot key off editable names, or renaming a status
--     would silently break every report. So statuses carry a stable
--     `funnel_stage` code that metrics group by, while `name` stays
--     free for the admin to change.
-- ═══════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- ── people ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  role        TEXT    NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'SALESPERSON')),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── editable lookup tables ────────────────────────────────────

-- funnel_stage is the stable analytics key; name is the editable label.
-- A status with funnel_stage NULL sits outside the funnel (e.g. Wrong Number).
CREATE TABLE IF NOT EXISTS statuses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  color        TEXT    NOT NULL DEFAULT 'slate',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  funnel_stage TEXT    CHECK (funnel_stage IN
                 ('NEW','CONTACTED','INTERESTED','MEETING','PROPOSAL','NEGOTIATION','CONVERTED')),
  is_won       INTEGER NOT NULL DEFAULT 0 CHECK (is_won IN (0, 1)),
  is_lost      INTEGER NOT NULL DEFAULT 0 CHECK (is_lost IN (0, 1)),
  is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- weight orders priorities for sorting without relying on the name
CREATE TABLE IF NOT EXISTS priorities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT    NOT NULL DEFAULT 'slate',
  weight     INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_types (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- counts_as_contact marks the outcomes that mean the lead was actually
-- reached, so "contact rate" has one definition for the whole app.
CREATE TABLE IF NOT EXISTS activity_outcomes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  counts_as_contact INTEGER NOT NULL DEFAULT 0 CHECK (counts_as_contact IN (0, 1)),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── leads ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name     TEXT    NOT NULL,
  contact_name      TEXT,
  phone             TEXT,
  normalized_phone  TEXT,
  email             TEXT COLLATE NOCASE,
  website           TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  country           TEXT,
  industry          TEXT,
  niche             TEXT,
  source_id         INTEGER REFERENCES lead_sources(id) ON DELETE SET NULL,
  status_id         INTEGER NOT NULL REFERENCES statuses(id),
  priority_id       INTEGER REFERENCES priorities(id) ON DELETE SET NULL,
  owner_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  estimated_value   REAL,
  notes             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  last_activity_at  TEXT,
  next_follow_up_at TEXT
);

-- ── activities ────────────────────────────────────────────────
-- A record that a salesperson did something. The CRM never performs
-- the call or message itself.
CREATE TABLE IF NOT EXISTS activities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id          INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE SET NULL,
  outcome_id       INTEGER REFERENCES activity_outcomes(id) ON DELETE SET NULL,
  notes            TEXT,
  duration_minutes INTEGER,
  follow_up_date   TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  description  TEXT,
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  due_date     TEXT,
  priority     TEXT    NOT NULL DEFAULT 'Medium'
                 CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status       TEXT    NOT NULL DEFAULT 'To Do'
                 CHECK (status IN ('To Do', 'In Progress', 'Completed', 'Cancelled')),
  completed_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── lead events ───────────────────────────────────────────────
-- Field changes are not activities. The team feed has to be able to
-- say "moved DEF Clothing from Contacted to Interested", which no
-- activity row describes, so changes get their own audit trail.
CREATE TABLE IF NOT EXISTS lead_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT    NOT NULL,   -- created | status_changed | assigned | priority_changed | imported
  from_value TEXT,
  to_value   TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_owner        ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status_id);
CREATE INDEX IF NOT EXISTS idx_leads_priority     ON leads(priority_id);
CREATE INDEX IF NOT EXISTS idx_leads_source       ON leads(source_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone        ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_leads_email        ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up    ON leads(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_act     ON leads(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_leads_created      ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_city         ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state        ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_industry     ON leads(industry);
CREATE INDEX IF NOT EXISTS idx_leads_niche        ON leads(niche);

CREATE INDEX IF NOT EXISTS idx_activities_lead    ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_user    ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_outcome ON activities(outcome_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned     ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due          ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_lead         ON tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_events_lead        ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_created     ON lead_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_user        ON lead_events(user_id);
