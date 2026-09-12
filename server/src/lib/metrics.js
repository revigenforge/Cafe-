/**
 * ═══════════════════════════════════════════════════════════════
 *  THE SINGLE DEFINITION OF EVERY METRIC IN THIS CRM
 *
 *  Nothing outside this file may decide what a metric means. The
 *  dashboard, the analytics page, the funnel and the per-salesperson
 *  report all import from here, so a number cannot say one thing on
 *  one page and something else on another.
 *
 *  If you need a new metric, add it here and use it — do not write
 *  a one-off COUNT in a route.
 * ═══════════════════════════════════════════════════════════════
 */

/** Human-readable definitions, served to the UI so a number can explain itself. */
export const METRIC_DEFINITIONS = {
  outreach_attempt:
    'Every saved activity record, regardless of type or outcome. One logged action = one attempt.',
  contacted_lead:
    'A lead with at least one activity whose outcome is marked "counts as contact" in Settings.',
  contact_rate: 'Contacted leads ÷ total leads in scope.',
  interest_rate: 'Leads that reached the Interested stage or beyond ÷ total leads in scope.',
  meeting_rate: 'Leads that reached the Meeting stage or beyond ÷ total leads in scope.',
  conversion_rate: 'Leads in a status flagged "won" ÷ total leads in scope.',
  follow_up_due: 'Lead has next_follow_up_at on or before the end of today and is not won or lost.',
  follow_up_overdue: 'Lead has next_follow_up_at before the start of today and is not won or lost.',
  task_overdue: 'Task has a due date before today and its status is neither Completed nor Cancelled.',
  stale_lead:
    'Lead has had no activity for the configured number of days (default 7) and is not won or lost.',
  working_day: 'A calendar day on which a salesperson logged at least one activity.',
};

/** Funnel stages in order. Statuses map onto these via statuses.funnel_stage. */
export const FUNNEL_STAGES = [
  { code: 'NEW', label: 'New' },
  { code: 'CONTACTED', label: 'Contacted' },
  { code: 'INTERESTED', label: 'Interested' },
  { code: 'MEETING', label: 'Meeting' },
  { code: 'PROPOSAL', label: 'Proposal' },
  { code: 'NEGOTIATION', label: 'Negotiation' },
  { code: 'CONVERTED', label: 'Converted' },
];

export const STAGE_ORDER = FUNNEL_STAGES.reduce((acc, s, i) => ({ ...acc, [s.code]: i }), {});

/** Stages at or beyond `code` — used by interest/meeting rates. */
export function stagesFrom(code) {
  const from = STAGE_ORDER[code];
  return FUNNEL_STAGES.filter((s) => STAGE_ORDER[s.code] >= from).map((s) => s.code);
}

/* ── date helpers ───────────────────────────────────────────────
   Dates are stored as 'YYYY-MM-DD HH:MM:SS' UTC text. Comparisons
   are done on the date part so "today" means a calendar day. */

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function daysAgoISO(days, now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the WHERE fragment + params shared by every lead-scoped metric.
 * Keeping scope in one place is what stops two pages disagreeing.
 *
 * @param {object} f
 * @param {number=} f.owner_id
 * @param {string=} f.date_from      filters on leads.created_at
 * @param {string=} f.date_to
 * @param {number=} f.status_id
 * @param {string=} f.niche
 * @param {string=} f.industry
 * @param {string=} f.state
 * @param {number=} f.source_id
 * @param {number[]=} f.owner_scope   restrict to these owner ids (role scoping)
 */
export function leadScope(f = {}) {
  const where = [];
  const params = {};

  if (f.owner_id != null) {
    where.push('l.owner_id = @owner_id');
    params.owner_id = Number(f.owner_id);
  }
  if (Array.isArray(f.owner_scope)) {
    if (f.owner_scope.length === 0) return { sql: '1 = 0', params };
    where.push(`l.owner_id IN (${f.owner_scope.map(Number).join(',')})`);
  }
  if (f.date_from) {
    where.push('date(l.created_at) >= date(@date_from)');
    params.date_from = f.date_from;
  }
  if (f.date_to) {
    where.push('date(l.created_at) <= date(@date_to)');
    params.date_to = f.date_to;
  }
  if (f.status_id != null) {
    where.push('l.status_id = @status_id');
    params.status_id = Number(f.status_id);
  }
  if (f.source_id != null) {
    where.push('l.source_id = @source_id');
    params.source_id = Number(f.source_id);
  }
  if (f.niche) {
    where.push('l.niche = @niche');
    params.niche = f.niche;
  }
  if (f.industry) {
    where.push('l.industry = @industry');
    params.industry = f.industry;
  }
  if (f.state) {
    where.push('l.state = @state');
    params.state = f.state;
  }
  if (f.city) {
    where.push('l.city = @city');
    params.city = f.city;
  }

  return { sql: where.length ? where.join(' AND ') : '1 = 1', params };
}

/** Same idea for activity-scoped metrics; dates filter on activities.created_at. */
export function activityScope(f = {}) {
  const where = [];
  const params = {};

  if (f.owner_id != null) {
    where.push('a.user_id = @owner_id');
    params.owner_id = Number(f.owner_id);
  }
  if (Array.isArray(f.owner_scope)) {
    if (f.owner_scope.length === 0) return { sql: '1 = 0', params };
    where.push(`a.user_id IN (${f.owner_scope.map(Number).join(',')})`);
  }
  if (f.date_from) {
    where.push('date(a.created_at) >= date(@date_from)');
    params.date_from = f.date_from;
  }
  if (f.date_to) {
    where.push('date(a.created_at) <= date(@date_to)');
    params.date_to = f.date_to;
  }

  return { sql: where.length ? where.join(' AND ') : '1 = 1', params };
}

/* ── the metrics ───────────────────────────────────────────────
   Each returns a plain number so callers cannot reinterpret them. */

export function totalLeads(db, f = {}) {
  const { sql, params } = leadScope(f);
  return db.prepare(`SELECT COUNT(*) AS n FROM leads l WHERE ${sql}`).get(params).n;
}

/** Leads currently sitting in a status whose funnel_stage is one of `codes`. */
export function leadsAtStages(db, codes, f = {}) {
  const { sql, params } = leadScope(f);
  const list = codes.map((c) => `'${c}'`).join(',');
  return db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND s.funnel_stage IN (${list})`
    )
    .get(params).n;
}

export function wonLeads(db, f = {}) {
  const { sql, params } = leadScope(f);
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND s.is_won = 1`
    )
    .get(params).n;
}

export function lostLeads(db, f = {}) {
  const { sql, params } = leadScope(f);
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND s.is_lost = 1`
    )
    .get(params).n;
}

/** Distinct leads with at least one "counts as contact" activity. */
export function contactedLeads(db, f = {}) {
  const { sql, params } = leadScope(f);
  return db
    .prepare(
      `SELECT COUNT(DISTINCT l.id) AS n
         FROM leads l
         JOIN activities a ON a.lead_id = l.id
         JOIN activity_outcomes o ON o.id = a.outcome_id
        WHERE ${sql} AND o.counts_as_contact = 1`
    )
    .get(params).n;
}

/** Outreach attempts — every saved activity row. */
export function totalActivities(db, f = {}) {
  const { sql, params } = activityScope(f);
  return db.prepare(`SELECT COUNT(*) AS n FROM activities a WHERE ${sql}`).get(params).n;
}

export function followUpsDue(db, f = {}, today = todayISO()) {
  const { sql, params } = leadScope(f);
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND l.next_follow_up_at IS NOT NULL
          AND date(l.next_follow_up_at) <= date(@today)
          AND s.is_won = 0 AND s.is_lost = 0`
    )
    .get({ ...params, today }).n;
}

export function followUpsOverdue(db, f = {}, today = todayISO()) {
  const { sql, params } = leadScope(f);
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND l.next_follow_up_at IS NOT NULL
          AND date(l.next_follow_up_at) < date(@today)
          AND s.is_won = 0 AND s.is_lost = 0`
    )
    .get({ ...params, today }).n;
}

/** Leads untouched for `days`, excluding won and lost. */
export function staleLeads(db, f = {}, days = 7) {
  const { sql, params } = leadScope(f);
  const cutoff = daysAgoISO(days);
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id
        WHERE ${sql} AND s.is_won = 0 AND s.is_lost = 0
          AND (l.last_activity_at IS NULL OR date(l.last_activity_at) < date(@cutoff))`
    )
    .get({ ...params, cutoff }).n;
}

export function tasksCompleted(db, f = {}) {
  const where = ["t.status = 'Completed'"];
  const params = {};
  if (f.owner_id != null) {
    where.push('t.assigned_to = @owner_id');
    params.owner_id = Number(f.owner_id);
  }
  if (Array.isArray(f.owner_scope)) {
    if (f.owner_scope.length === 0) return 0;
    where.push(`t.assigned_to IN (${f.owner_scope.map(Number).join(',')})`);
  }
  if (f.date_from) {
    where.push('date(t.completed_at) >= date(@date_from)');
    params.date_from = f.date_from;
  }
  if (f.date_to) {
    where.push('date(t.completed_at) <= date(@date_to)');
    params.date_to = f.date_to;
  }
  return db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE ${where.join(' AND ')}`).get(params).n;
}

export function tasksOverdue(db, f = {}, today = todayISO()) {
  const where = [
    "t.status NOT IN ('Completed', 'Cancelled')",
    't.due_date IS NOT NULL',
    'date(t.due_date) < date(@today)',
  ];
  const params = { today };
  if (f.owner_id != null) {
    where.push('t.assigned_to = @owner_id');
    params.owner_id = Number(f.owner_id);
  }
  if (Array.isArray(f.owner_scope)) {
    if (f.owner_scope.length === 0) return 0;
    where.push(`t.assigned_to IN (${f.owner_scope.map(Number).join(',')})`);
  }
  return db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE ${where.join(' AND ')}`).get(params).n;
}

/** Distinct days on which this user logged at least one activity. */
export function workingDays(db, f = {}) {
  const { sql, params } = activityScope(f);
  return db
    .prepare(`SELECT COUNT(DISTINCT date(a.created_at)) AS n FROM activities a WHERE ${sql}`)
    .get(params).n;
}

export const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

/**
 * The headline block every dashboard and analytics view renders from.
 * One call, one set of definitions, no page-specific arithmetic.
 */
export function summary(db, f = {}) {
  const total = totalLeads(db, f);
  const contacted = contactedLeads(db, f);
  const interested = leadsAtStages(db, stagesFrom('INTERESTED'), f);
  const meetings = leadsAtStages(db, stagesFrom('MEETING'), f);
  const proposals = leadsAtStages(db, stagesFrom('PROPOSAL'), f);
  const converted = wonLeads(db, f);

  return {
    total_leads: total,
    new_leads: leadsAtStages(db, ['NEW'], f),
    contacted_leads: contacted,
    interested_leads: interested,
    meetings_booked: meetings,
    proposals_sent: proposals,
    converted_leads: converted,
    lost_leads: lostLeads(db, f),
    follow_ups_due: followUpsDue(db, f),
    follow_ups_overdue: followUpsOverdue(db, f),
    stale_leads: staleLeads(db, f),
    total_activities: totalActivities(db, f),
    tasks_completed: tasksCompleted(db, f),
    tasks_overdue: tasksOverdue(db, f),
    contact_rate: rate(contacted, total),
    interest_rate: rate(interested, total),
    meeting_rate: rate(meetings, total),
    conversion_rate: rate(converted, total),
  };
}
