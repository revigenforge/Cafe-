import { Router } from 'express';
import db from '../db/index.js';
import { handle, notFound, badRequest } from '../middleware/errors.js';
import { visibleOwnerIds, assertLeadAccess, canSeeTeam } from '../middleware/auth.js';
import { str, int, dateStr, refId } from '../middleware/validate.js';

const router = Router();

const SELECT = `
  SELECT a.*, u.name AS user_name, u.role AS user_role,
         at.name AS activity_type_name,
         o.name AS outcome_name, o.counts_as_contact,
         l.business_name AS lead_business_name, l.owner_id AS lead_owner_id
    FROM activities a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN activity_types at ON at.id = a.activity_type_id
    LEFT JOIN activity_outcomes o ON o.id = a.outcome_id
    JOIN leads l ON l.id = a.lead_id
`;

/* ── list / feed ───────────────────────────────────────────── */

router.get(
  '/',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const where = [];
    const params = {};

    /* A salesperson sees only their own logged work. Managers and
       admins see the team, which is what makes the feed useful. */
    if (Array.isArray(scope)) where.push(`a.user_id IN (${scope.map(Number).join(',')})`);

    if (req.query.lead_id) {
      params.lead_id = int(req.query.lead_id, 'lead_id', { min: 1 });
      where.push('a.lead_id = @lead_id');
    }
    if (req.query.user_id) {
      params.user_id = int(req.query.user_id, 'user_id', { min: 1 });
      where.push('a.user_id = @user_id');
    }
    if (req.query.activity_type_id) {
      params.type_id = int(req.query.activity_type_id, 'activity_type_id', { min: 1 });
      where.push('a.activity_type_id = @type_id');
    }
    if (req.query.outcome_id) {
      params.outcome_id = int(req.query.outcome_id, 'outcome_id', { min: 1 });
      where.push('a.outcome_id = @outcome_id');
    }
    if (req.query.date_from) {
      params.date_from = dateStr(req.query.date_from, 'date_from');
      where.push('date(a.created_at) >= date(@date_from)');
    }
    if (req.query.date_to) {
      params.date_to = dateStr(req.query.date_to, 'date_to');
      where.push('date(a.created_at) <= date(@date_to)');
    }

    const sql = where.length ? where.join(' AND ') : '1 = 1';
    const page = Math.max(1, int(req.query.page, 'page') || 1);
    const perPage = Math.min(200, Math.max(1, int(req.query.per_page, 'per_page') || 50));

    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM activities a JOIN leads l ON l.id = a.lead_id WHERE ${sql}`)
      .get(params).n;

    const rows = db
      .prepare(`${SELECT} WHERE ${sql} ORDER BY a.created_at DESC, a.id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: perPage, offset: (page - 1) * perPage });

    res.json({ data: rows, page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
  })
);

/**
 * The combined team feed: activities, plus the field changes that no
 * activity row describes ("moved X from Contacted to Interested").
 */
router.get(
  '/feed',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const limit = Math.min(200, Math.max(1, int(req.query.limit, 'limit') || 60));

    const actWhere = Array.isArray(scope) ? `WHERE a.user_id IN (${scope.map(Number).join(',')})` : '';
    const evtWhere = Array.isArray(scope) ? `WHERE e.user_id IN (${scope.map(Number).join(',')})` : '';

    const activities = db
      .prepare(
        `SELECT a.id, a.created_at, a.notes, a.lead_id,
                u.name AS user_name, at.name AS activity_type_name, o.name AS outcome_name,
                l.business_name
           FROM activities a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN activity_types at ON at.id = a.activity_type_id
           LEFT JOIN activity_outcomes o ON o.id = a.outcome_id
           JOIN leads l ON l.id = a.lead_id
           ${actWhere}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({ kind: 'activity', ...r }));

    const events = db
      .prepare(
        `SELECT e.id, e.created_at, e.event_type, e.from_value, e.to_value, e.lead_id,
                u.name AS user_name, l.business_name
           FROM lead_events e
           LEFT JOIN users u ON u.id = e.user_id
           JOIN leads l ON l.id = e.lead_id
           ${evtWhere}
          ORDER BY e.created_at DESC, e.id DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({ kind: 'event', ...r }));

    const tasks = db
      .prepare(
        `SELECT t.id, t.completed_at AS created_at, t.title, t.lead_id,
                u.name AS user_name, l.business_name
           FROM tasks t
           LEFT JOIN users u ON u.id = t.assigned_to
           LEFT JOIN leads l ON l.id = t.lead_id
          WHERE t.status = 'Completed' AND t.completed_at IS NOT NULL
            ${Array.isArray(scope) ? `AND t.assigned_to IN (${scope.map(Number).join(',')})` : ''}
          ORDER BY t.completed_at DESC LIMIT ?`
      )
      .all(limit)
      .map((r) => ({ kind: 'task_completed', ...r }));

    const merged = [...activities, ...events, ...tasks]
      .filter((r) => r.created_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);

    res.json({ data: merged });
  })
);

/* ── log an activity ───────────────────────────────────────── */

/**
 * Logging records what a salesperson already did elsewhere. It also
 * moves the lead's clock forward: last_activity_at always, and
 * next_follow_up_at when the activity schedules one.
 */
router.post(
  '/',
  handle((req, res) => {
    const leadId = refId(db, 'leads', req.body.lead_id, 'lead_id', { required: true });
    const lead = db.prepare('SELECT id, owner_id FROM leads WHERE id = ?').get(leadId);
    assertLeadAccess(req.user, lead.owner_id);

    const f = {
      lead_id: leadId,
      user_id: req.user.id,
      activity_type_id: refId(db, 'activity_types', req.body.activity_type_id, 'activity_type_id', { required: true }),
      outcome_id: refId(db, 'activity_outcomes', req.body.outcome_id, 'outcome_id'),
      notes: str(req.body.notes, 'notes', { max: 10000 }),
      duration_minutes: int(req.body.duration_minutes, 'duration_minutes', { min: 0, max: 60 * 24 }),
      follow_up_date: dateStr(req.body.follow_up_date, 'follow_up_date'),
    };

    const statusId = req.body.status_id
      ? refId(db, 'statuses', req.body.status_id, 'status_id')
      : null;

    const result = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO activities
             (lead_id, user_id, activity_type_id, outcome_id, notes, duration_minutes, follow_up_date)
           VALUES (@lead_id, @user_id, @activity_type_id, @outcome_id, @notes, @duration_minutes, @follow_up_date)`
        )
        .run(f);

      db.prepare(
        `UPDATE leads
            SET last_activity_at = datetime('now'),
                next_follow_up_at = COALESCE(@follow_up, next_follow_up_at),
                updated_at = datetime('now')
          WHERE id = @lead_id`
      ).run({ follow_up: f.follow_up_date, lead_id: leadId });

      /* Letting the status move in the same request is what keeps the
         queue to one interaction per lead. */
      if (statusId) {
        const before = db.prepare('SELECT status_id FROM leads WHERE id = ?').get(leadId).status_id;
        if (before !== statusId) {
          db.prepare("UPDATE leads SET status_id = ?, updated_at = datetime('now') WHERE id = ?").run(statusId, leadId);
          const nm = (id) => db.prepare('SELECT name FROM statuses WHERE id = ?').get(id)?.name ?? null;
          db.prepare(
            `INSERT INTO lead_events (lead_id, user_id, event_type, from_value, to_value)
             VALUES (?, ?, 'status_changed', ?, ?)`
          ).run(leadId, req.user.id, nm(before), nm(statusId));
        }
      }

      return info.lastInsertRowid;
    })();

    res.status(201).json(db.prepare(`${SELECT} WHERE a.id = ?`).get(result));
  })
);

router.patch(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
    if (!row) throw notFound('Activity not found');

    /* Only the person who logged it, or a manager, may correct it. */
    if (row.user_id !== req.user.id && !canSeeTeam(req.user)) {
      throw notFound('Activity not found');
    }

    const patch = {};
    if ('notes' in req.body) patch.notes = str(req.body.notes, 'notes', { max: 10000 });
    if ('outcome_id' in req.body) patch.outcome_id = refId(db, 'activity_outcomes', req.body.outcome_id, 'outcome_id');
    if ('duration_minutes' in req.body) patch.duration_minutes = int(req.body.duration_minutes, 'duration_minutes', { min: 0 });
    if ('follow_up_date' in req.body) patch.follow_up_date = dateStr(req.body.follow_up_date, 'follow_up_date');
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    db.prepare(
      `UPDATE activities SET ${Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`
    ).run({ ...patch, id });

    res.json(db.prepare(`${SELECT} WHERE a.id = ?`).get(id));
  })
);

router.delete(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
    if (!row) throw notFound('Activity not found');
    if (row.user_id !== req.user.id && !canSeeTeam(req.user)) throw notFound('Activity not found');

    db.prepare('DELETE FROM activities WHERE id = ?').run(id);

    /* The lead's clock was derived from this row, so recompute it. */
    const latest = db
      .prepare('SELECT MAX(created_at) AS t FROM activities WHERE lead_id = ?')
      .get(row.lead_id).t;
    db.prepare('UPDATE leads SET last_activity_at = ? WHERE id = ?').run(latest, row.lead_id);

    res.json({ ok: true, deleted: id });
  })
);

export default router;
