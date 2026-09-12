# Team Sales CRM

A self-hosted CRM for running a sales team: leads, activities, tasks,
follow-ups, ownership, pipeline and performance.

**It is not a calling system.** It never dials, messages, records or
transcribes anything. You call or message from your own phone, then log
what happened. That boundary is deliberate and is stated on the screens
where it matters.

React + Vite on the front, Express + better-sqlite3 on the back, REST in
between. No ORM.

---

## Run it

Two terminals. Node 18+ required (built and tested on Node 22).

```bash
# 1 — API
cd server
npm install
npm run db:seed        # creates the database and loads demo data
npm start              # http://localhost:4000

# 2 — web
cd client
npm install
npm run dev            # http://localhost:5173
```

Open http://localhost:5173 and pick a user.

### Database commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Creates the schema and the default reference data. Safe to re-run. |
| `npm run db:seed` | Migrates, then replaces demo users/leads/activities/tasks. Lookup tables are left alone, so admin edits survive. |
| `npm run db:reset -- --yes` | Deletes the database file and rebuilds from scratch. Refuses without `--yes`. |

The database is one file at `server/data/crm.db` (plus WAL sidecars).
Back it up by copying it. It is gitignored — it is local state, not source.

### Environment variables

Everything has a working default; none are required.

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `4000` | API listen port |
| `CRM_DB_PATH` | `server/data/crm.db` | SQLite file location |
| `CRM_DEFAULT_COUNTRY_CODE` | `91` | Phone normalisation — strips this country code before duplicate checks |
| `CRM_API_URL` | `http://localhost:4000` | Where Vite proxies `/api` in development |

### Tests

```bash
cd server && npm start &       # the API must be running
cd server && npm run db:seed && npm test    # 56 API tests
cd client && node e2e.js       # 36 browser checks, needs the Vite dev server too
```

The API tests hit a live server against the seeded database — real SQL,
real permission checks, real validation. The browser tests drive the
actual UI as three different roles and fail on any uncaught page error.

---

## Sign-in is not authentication yet

The login screen picks which user you are acting as, and the client sends
that id in an `x-user-id` header. **Anyone who can reach the API can claim
to be anyone.** This is a development stand-in so the team workflow can be
tested from every role.

What is already real is the *authorisation*: every rule below is enforced
server-side in `server/src/middleware/auth.js`, not in the UI. A
salesperson passing a colleague's `owner_id` as a query parameter gets an
empty list, not their leads. When real sign-in arrives, `currentUser()` is
the only function that changes — every permission check stays as written.

Do not put this on a network other people can reach until that is done.

### Roles

| | Admin | Manager | Salesperson |
|---|---|---|---|
| See all leads | ✓ | ✓ | own only |
| Assign / reassign leads | ✓ | ✓ | — |
| Delete leads | ✓ | ✓ | — |
| Log activities | ✓ | ✓ | on own leads |
| Create tasks for others | ✓ | ✓ | self only |
| Team activity feed | ✓ | ✓ | — |
| Analytics & performance | ✓ | ✓ | own figures only |
| CSV import | ✓ | ✓ | — |
| Settings & users | ✓ | — | — |

---

## Two decisions worth knowing about

**Statuses are editable, but reports do not key off their names.**
Each status carries a stable `funnel_stage` code (`NEW`, `CONTACTED`,
`INTERESTED`, `MEETING`, `PROPOSAL`, `NEGOTIATION`, `CONVERTED`) plus
`is_won` / `is_lost` flags. Analytics group by the code. Rename
"Interested" to anything you like and every report keeps working — which
is what makes "don't hard-code statuses" survive contact with reporting.
A status mapped to no stage sits outside the funnel entirely, which is
right for things like *Wrong Number*.

**Field changes are audited separately from activities.**
The team feed has to be able to say *"Atharva moved DEF Clothing from
Contacted → Interested"*. No activity row describes that, so status
changes, assignments and priority changes go to their own `lead_events`
table. The feed merges activities, events and completed tasks into one
chronological stream.

### One definition per metric

`server/src/lib/metrics.js` is the only file allowed to decide what a
metric means. The dashboard, the analytics page, the funnel and the
per-salesperson report all call into it; none of them counts anything
itself. Two tests hold this in place: one asserts the dashboard and the
analytics summary return identical numbers for the same user, another
asserts per-person lead counts plus unassigned equal the team total.

| Metric | Definition |
|---|---|
| Outreach attempt | Every saved activity row, whatever its type or outcome |
| Contacted lead | A lead with ≥1 activity whose outcome is flagged *counts as contact* in Settings |
| Contact / interest / meeting / conversion rate | Those leads ÷ total leads in scope |
| Follow-up due | `next_follow_up_at` ≤ today, and the lead is neither won nor lost |
| Follow-up overdue | `next_follow_up_at` < today, same exclusion |
| Task overdue | Due date < today and status is neither Completed nor Cancelled |
| Stale lead | No activity for 7 days, and not won or lost |
| Working day | A day on which that person logged at least one activity |

The funnel counts leads that reached a stage **or any stage beyond it**,
so a lead in Negotiation still counts as having been Contacted. Counting
only the current stage would invent drop-offs that never happened.

---

## Project structure

```
server/
  src/
    index.js              express app, route mounting
    db/
      schema.sql          tables, constraints, indexes
      index.js            connection, WAL, transaction helper
      migrate.js          schema + default statuses/sources/priorities/types/outcomes
      seed.js             demo users, leads, activities, tasks
      reset.js            destructive rebuild
    middleware/
      auth.js             acting user, role guards, owner scoping
      validate.js         hand-rolled validators; last line before SQL
      errors.js           ApiError + handler that never leaks table names
    lib/
      metrics.js          THE metric definitions
      leadQuery.js        filter/sort builder for the leads list
      phone.js            phone normalisation
      csv.js              RFC-4180 parser + column guessing
    routes/               users, leads, activities, tasks, settings,
                          dashboard, analytics, import, search
  test/api.test.js        56 end-to-end API tests

client/
  src/
    api/client.js         the only place that talks to the API
    context/AppContext    acting user + every editable lookup, fetched once
    components/           ui.jsx (badges, modals, states), modals.jsx, GlobalSearch
    pages/                Dashboard, MyWork, Queue, Leads, LeadDetail, Pipeline,
                          Tasks, TeamActivity, Analytics, Performance,
                          ImportLeads, Settings, Login
    styles/app.css        one stylesheet, tokens at the top
  e2e.js                  36 browser checks across three roles
```

---

## What works

**Leads** — create, edit, delete, assign. Search across name, contact,
phone, email, website, city, state and notes. Filters for owner, status,
priority, industry, niche, city, state, source, created/activity/follow-up
date ranges, has-email and has-website — all combining with AND, all held
in the URL so a view can be bookmarked. Sortable columns, pagination,
column visibility saved per browser, multi-select with bulk assign / status
/ priority / delete, copy selected phone numbers, CSV export of the current
filter.

**Lead detail** — full record, inline status/priority/owner/follow-up
controls, and a timeline merging activities with field changes. Duplicate
warning while typing a phone or email into the new-lead form.

**Activities** — log type, outcome, notes, duration and next follow-up in
one dialog, and move the status in the same submit. Logging advances the
lead's clock; deleting an activity recomputes it.

**Tasks** — title, description, assignee, linked lead, due date, priority,
status. My / today / overdue / upcoming / completed views with counts that
are computed the same way as the lists they label. Bulk complete and cancel.
`completed_at` is derived from status, never sent by the client.

**Sales queue** — one ordered list: overdue follow-ups, then due today,
then never-contacted, then gone quiet. Each row says why it surfaced.
Call/copy/log/skip without leaving the page.

**Pipeline board** — a column per active status, drag to move, per-column
totals and value.

**Dashboards** — a salesperson sees their own day; a manager additionally
gets team figures and a like-for-like comparison.

**Team activity** — merged chronological feed grouped by day, filterable
by person.

**CSV import** — upload or paste, automatic column guessing from ~90
heading aliases, preview, then import. Reports imported / duplicate /
invalid / skipped separately with per-line reasons. Phone numbers are
normalised before duplicate checking, and duplicates are caught both
against the database and within the same file.

**Analytics** — headline metrics, funnel with drop-off, breakdowns by
source/niche/industry/state/city/owner/priority, activity trend, all
filterable by date range, salesperson, source, niche and state.

**Performance** — per-salesperson leads, contacted, activities, activities
per working day, meetings, proposals, conversions, rates, overdue
follow-ups and overdue tasks, plus a per-person drill-down.

**Settings** — users, statuses, sources, priorities, activity types and
outcomes: add, edit, reorder, deactivate, delete. Guard rails stop you
removing a status leads still use, deleting the default status or
priority, or demoting the last admin.

**Throughout** — loading skeletons, empty states, error states with retry,
toasts, confirmation before anything destructive, keyboard-reachable
controls, ⌘K search, and a layout that works down to 390px. Every button
does something; there are no placeholder controls.

---

## Deliberately not built

Named in the brief as future work, and left out on purpose:

- **Real authentication** — see the warning above. The architecture is
  ready for it; the sign-in itself is not written.
- **PostgreSQL** — SQLite only. The SQL is plain and parameterised, and
  no SQLite-specific feature is load-bearing beyond `datetime('now')`,
  so a port is mostly mechanical.
- **Telephony of any kind** — no Twilio, no browser calling, no dialer,
  no recording, no transcription. Explicitly out of scope.
- **WhatsApp / email integration** — activities are logged by hand.
- **A direct Claude API integration** — leads arrive as CSV. The import
  path is a normal route, so an ingestion endpoint can be added beside it
  without touching lead management.
- **AI-assisted follow-ups, automated ingestion, advanced reporting.**

Smaller things that were scoped out rather than half-built: attachments,
email templates, per-user notification preferences, a mobile app, audit
logging beyond `lead_events`, and soft-delete/restore for leads.

---

## API

All routes are under `/api`. Every route except the two marked *open*
requires an `x-user-id` header.

### Session & settings
```
GET    /api/health                      open — liveness
GET    /api/session/users               open — roster for the login screen
GET    /api/settings/bootstrap          every lookup the UI needs, in one call
GET    /api/settings/:collection        statuses | lead_sources | priorities |
                                        activity_types | activity_outcomes
POST   /api/settings/:collection        admin
PATCH  /api/settings/:collection/:id    admin
DELETE /api/settings/:collection/:id    admin
```

### Users
```
GET    /api/users                       ?include_inactive=true
GET    /api/users/:id
POST   /api/users                       admin
PATCH  /api/users/:id                   admin
DELETE /api/users/:id                   admin — deactivates, never deletes
```

### Leads
```
GET    /api/leads                       list; see filters below
GET    /api/leads/facets                distinct industries/niches/cities/states
GET    /api/leads/export                CSV of the current filter
GET    /api/leads/:id                   lead + activities + tasks + events
POST   /api/leads
PATCH  /api/leads/:id
DELETE /api/leads/:id                   admin / manager
POST   /api/leads/bulk/assign           admin / manager   { ids, owner_id }
POST   /api/leads/bulk/status           { ids, status_id }
POST   /api/leads/bulk/priority         { ids, priority_id }
POST   /api/leads/bulk/delete           admin / manager   { ids }
POST   /api/leads/bulk/phones           { ids } → numbers to copy
```

Lead list parameters — all optional, all combining with AND:

`search`, `status_id`, `priority_id`, `source_id`, `owner_id`
(or `owner_id=unassigned`), `industry`, `niche`, `city`, `state`,
`country`, `created_from`, `created_to`, `last_activity_from`,
`last_activity_to`, `follow_up_from`, `follow_up_to`, `has_email`,
`has_website`, `has_phone`, `view` (`open` · `follow_up_due` ·
`follow_up_overdue` · `stale` · `unassigned`), `sort`, `dir`, `page`,
`per_page`.

### Activities, tasks, dashboard
```
GET    /api/activities                  ?lead_id &user_id &date_from &date_to
GET    /api/activities/feed             merged team feed
POST   /api/activities                  may also move status in the same call
PATCH  /api/activities/:id
DELETE /api/activities/:id

GET    /api/tasks                       ?view=today|overdue|upcoming|open|completed
GET    /api/tasks/counts                ?scope=mine|team
GET    /api/tasks/:id
POST   /api/tasks
PATCH  /api/tasks/:id
POST   /api/tasks/bulk/status           { ids, status }
DELETE /api/tasks/:id

GET    /api/dashboard                   today, for this user (+ team if allowed)
GET    /api/dashboard/queue             ?owner_id=<id>|all &limit
```

### Analytics, search, import
```
GET    /api/analytics/summary           filters: owner_id, date_from, date_to,
GET    /api/analytics/funnel                     status_id, source_id, niche,
GET    /api/analytics/by-status                  industry, state, city
GET    /api/analytics/breakdown         &field=source|niche|industry|state|
                                                city|owner|priority
GET    /api/analytics/activity-trend
GET    /api/analytics/performance       admin / manager
GET    /api/analytics/performance/:id   own figures, or any if allowed

GET    /api/search?q=                   leads, tasks and people
GET    /api/search/duplicates?phone=&email=

GET    /api/import/fields
POST   /api/import/analyze              admin / manager — reads, writes nothing
POST   /api/import/commit               admin / manager — { csv, mapping,
                                        owner_id?, source_id?, skip_duplicates? }
```

Errors come back as `{ "error": "message" }` with a useful status:
`400` validation, `401` no acting user, `403` role or ownership,
`404` missing, `409` conflict. SQLite messages are translated rather than
passed through, so table and column names are never exposed.

---

## Demo data

`npm run db:seed` loads five users and fifty leads with a realistic spread
— some unassigned, some never contacted, some gone quiet, follow-ups
overdue and upcoming, tasks in every state, and activities weighted so
leads deeper in the funnel have more history. The generator is seeded, so
reseeding gives the same book each time.

| id | name | role |
|---|---|---|
| 1 | Aditya Rao | ADMIN |
| 2 | Keeya Menon | MANAGER |
| 3 | Atharva Joshi | SALESPERSON |
| 4 | Harsh Bhatia | SALESPERSON |
| 5 | Nidhi Kulkarni | SALESPERSON |

Sign in as Atharva to see the salesperson view — a smaller book, no team
pages, and no Settings.
