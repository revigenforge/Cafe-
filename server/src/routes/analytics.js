import { Router } from 'express';
import db from '../db/index.js';
import { handle } from '../middleware/errors.js';
import { visibleOwnerIds, canSeeTeam, requireRole } from '../middleware/auth.js';
import { int, dateStr, str } from '../middleware/validate.js';
import {
  summary, leadScope, activityScope, FUNNEL_STAGES, stagesFrom,
  totalLeads, leadsAtStages, contactedLeads, totalActivities, wonLeads, lostLeads,
  followUpsOverdue, tasksCompleted, tasksOverdue, workingDays, rate, METRIC_DEFINITIONS,
} from '../lib/metrics.js';

const router = Router();

/** Reads the shared filter set, then clamps it to what the caller may see. */
function readFilters(req) {
  const f = {};
  if (req.query.owner_id) f.owner_id = int(req.query.owner_id, 'owner_id', { min: 1 });
  if (req.query.date_from) f.date_from = dateStr(req.query.date_from, 'date_from');
  if (req.query.date_to) f.date_to = dateStr(req.query.date_to, 'date_to');
  if (req.query.status_id) f.status_id = int(req.query.status_id, 'status_id', { min: 1 });
  if (req.query.source_id) f.source_id = int(req.query.source_id, 'source_id', { min: 1 });
  if (req.query.niche) f.niche = str(req.query.niche, 'niche', { max: 120 });
  if (req.query.industry) f.industry = str(req.query.industry, 'industry', { max: 120 });
  if (req.query.state) f.state = str(req.query.state, 'state', { max: 120 });
  if (req.query.city) f.city = str(req.query.city, 'city', { max: 120 });

  /* A salesperson's analytics are their own, whatever they ask for. */
  const scope = visibleOwnerIds(req.user);
  if (Array.isArray(scope)) {
    f.owner_scope = scope;
    delete f.owner_id;
  }
  return f;
}

router.get(
  '/summary',
  handle((req, res) => {
    const f = readFilters(req);
    res.json({ filters: f, definitions: METRIC_DEFINITIONS, ...summary(db, f) });
  })
);

/**
 * The funnel counts leads at each stage *or beyond*, so a lead sitting
 * in Negotiation still counts as having reached Contacted. Counting
 * only the current stage would make every later stage look like a
 * drop-off that never happened.
 */
router.get(
  '/funnel',
  handle((req, res) => {
    const f = readFilters(req);
    const total = totalLeads(db, f);

    const stages = FUNNEL_STAGES.map((s) => {
      const reached = leadsAtStages(db, stagesFrom(s.code), f);
      return { code: s.code, label: s.label, count: reached, pct_of_total: rate(reached, total) };
    });

    // drop-off between consecutive stages
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].count;
      stages[i].drop_off = prev - stages[i].count;
      stages[i].step_rate = rate(stages[i].count, prev);
    }
    stages[0].drop_off = 0;
    stages[0].step_rate = 100;

    res.json({ total_leads: total, stages, filters: f });
  })
);

/** Leads grouped by their current status — the pipeline board totals. */
router.get(
  '/by-status',
  handle((req, res) => {
    const f = readFilters(req);
    const { sql, params } = leadScope(f);
    const rows = db
      .prepare(
        `SELECT s.id, s.name, s.color, s.sort_order, s.funnel_stage, s.is_won, s.is_lost,
                COUNT(l.id) AS count,
                COALESCE(SUM(l.estimated_value), 0) AS value
           FROM statuses s
           LEFT JOIN leads l ON l.status_id = s.id AND ${sql}
          WHERE s.active = 1
          GROUP BY s.id ORDER BY s.sort_order`
      )
      .all(params);
    res.json({ data: rows });
  })
);

/** Simple breakdowns for the analytics page charts. */
router.get(
  '/breakdown',
  handle((req, res) => {
    const f = readFilters(req);
    const { sql, params } = leadScope(f);
    const field = String(req.query.field || 'source');

    const COLUMNS = {
      source: 'COALESCE(src.name, \'Unknown\')',
      industry: "COALESCE(NULLIF(l.industry, ''), 'Unknown')",
      niche: "COALESCE(NULLIF(l.niche, ''), 'Unknown')",
      state: "COALESCE(NULLIF(l.state, ''), 'Unknown')",
      city: "COALESCE(NULLIF(l.city, ''), 'Unknown')",
      owner: "COALESCE(u.name, 'Unassigned')",
      priority: "COALESCE(p.name, 'None')",
    };
    const col = COLUMNS[field] || COLUMNS.source;

    const rows = db
      .prepare(
        `SELECT ${col} AS label, COUNT(*) AS count,
                SUM(CASE WHEN s.is_won = 1 THEN 1 ELSE 0 END) AS converted
           FROM leads l
           JOIN statuses s ON s.id = l.status_id
           LEFT JOIN lead_sources src ON src.id = l.source_id
           LEFT JOIN users u ON u.id = l.owner_id
           LEFT JOIN priorities p ON p.id = l.priority_id
          WHERE ${sql}
          GROUP BY label ORDER BY count DESC LIMIT 30`
      )
      .all(params);

    res.json({ field, data: rows.map((r) => ({ ...r, conversion_rate: rate(r.converted, r.count) })) });
  })
);

/** Activity volume per day, for the trend line. */
router.get(
  '/activity-trend',
  handle((req, res) => {
    const f = readFilters(req);
    const { sql, params } = activityScope(f);
    const rows = db
      .prepare(
        `SELECT date(a.created_at) AS day, COUNT(*) AS count,
                COUNT(DISTINCT a.lead_id) AS leads_touched,
                COUNT(DISTINCT a.user_id) AS people
           FROM activities a WHERE ${sql}
          GROUP BY day ORDER BY day DESC LIMIT 90`
      )
      .all(params);
    res.json({ data: rows.reverse() });
  })
);

/**
 * Per-salesperson performance. Every column reuses the shared metric
 * functions, so a person's numbers here match their own dashboard.
 */
router.get(
  '/performance',
  requireRole('ADMIN', 'MANAGER'),
  handle((req, res) => {
    const base = readFilters(req);
    const people = db
      .prepare("SELECT id, name, email, role FROM users WHERE active = 1 AND role != 'ADMIN' ORDER BY name")
      .all();

    const rows = people.map((u) => {
      const f = { ...base, owner_id: u.id };
      delete f.owner_scope;

      const leads = totalLeads(db, f);
      const contacted = contactedLeads(db, f);
      const meetings = leadsAtStages(db, stagesFrom('MEETING'), f);
      const proposals = leadsAtStages(db, stagesFrom('PROPOSAL'), f);
      const converted = wonLeads(db, f);
      const activities = totalActivities(db, f);
      const days = workingDays(db, f);

      return {
        user_id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        leads_assigned: leads,
        leads_contacted: contacted,
        activities_logged: activities,
        meetings_booked: meetings,
        proposals_sent: proposals,
        conversions: converted,
        lost: lostLeads(db, f),
        follow_ups_overdue: followUpsOverdue(db, f),
        tasks_completed: tasksCompleted(db, f),
        tasks_overdue: tasksOverdue(db, f),
        contact_rate: rate(contacted, leads),
        conversion_rate: rate(converted, leads),
        working_days: days,
        activities_per_working_day: days > 0 ? Math.round((activities / days) * 10) / 10 : 0,
      };
    });

    res.json({ data: rows, definitions: METRIC_DEFINITIONS, filters: base });
  })
);

/** One salesperson in depth — available to that person too. */
router.get(
  '/performance/:userId',
  handle((req, res) => {
    const userId = int(req.params.userId, 'userId', { required: true, min: 1 });
    if (!canSeeTeam(req.user) && userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own performance' });
    }

    const base = readFilters(req);
    const f = { ...base, owner_id: userId };
    delete f.owner_scope;

    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { sql, params } = activityScope({ ...f, owner_id: userId });
    const byType = db
      .prepare(
        `SELECT COALESCE(at.name, 'Unspecified') AS label, COUNT(*) AS count
           FROM activities a LEFT JOIN activity_types at ON at.id = a.activity_type_id
          WHERE ${sql} GROUP BY label ORDER BY count DESC`
      )
      .all(params);

    const byOutcome = db
      .prepare(
        `SELECT COALESCE(o.name, 'Unspecified') AS label, COUNT(*) AS count
           FROM activities a LEFT JOIN activity_outcomes o ON o.id = a.outcome_id
          WHERE ${sql} GROUP BY label ORDER BY count DESC`
      )
      .all(params);

    res.json({ user, summary: summary(db, f), by_type: byType, by_outcome: byOutcome, filters: base });
  })
);

export default router;
