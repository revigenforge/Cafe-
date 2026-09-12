import { Router } from 'express';
import db from '../db/index.js';
import { handle, notFound, badRequest, forbidden } from '../middleware/errors.js';
import { visibleOwnerIds, canSeeTeam } from '../middleware/auth.js';
import { str, int, dateStr, oneOf, refId, idList } from '../middleware/validate.js';

const router = Router();

export const TASK_STATUSES = ['To Do', 'In Progress', 'Completed', 'Cancelled'];
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const SELECT = `
  SELECT t.*,
         u.name AS assigned_to_name,
         c.name AS created_by_name,
         l.business_name AS lead_business_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN users c ON c.id = t.created_by
    LEFT JOIN leads l ON l.id = t.lead_id
`;

/* Ordering that puts what matters today at the top: open before done,
   overdue before upcoming, urgent before low. */
const ORDER = `
  ORDER BY
    CASE t.status WHEN 'To Do' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END,
    (t.due_date IS NULL), t.due_date,
    CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
    t.id DESC
`;

router.get(
  '/',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const where = [];
    const params = {};
    const today = new Date().toISOString().slice(0, 10);

    if (Array.isArray(scope)) where.push(`t.assigned_to IN (${scope.map(Number).join(',')})`);

    if (req.query.assigned_to) {
      params.assigned_to = int(req.query.assigned_to, 'assigned_to', { min: 1 });
      where.push('t.assigned_to = @assigned_to');
    }
    if (req.query.lead_id) {
      params.lead_id = int(req.query.lead_id, 'lead_id', { min: 1 });
      where.push('t.lead_id = @lead_id');
    }
    if (req.query.status) {
      const list = String(req.query.status).split(',').filter((s) => TASK_STATUSES.includes(s));
      if (list.length) where.push(`t.status IN (${list.map((s) => `'${s}'`).join(',')})`);
    }
    if (req.query.priority) {
      const list = String(req.query.priority).split(',').filter((s) => TASK_PRIORITIES.includes(s));
      if (list.length) where.push(`t.priority IN (${list.map((s) => `'${s}'`).join(',')})`);
    }

    // the saved views the sidebar counts and My Work rely on
    params.today = today;
    switch (req.query.view) {
      case 'today':
        where.push("t.status NOT IN ('Completed','Cancelled') AND date(t.due_date) = date(@today)");
        break;
      case 'overdue':
        where.push("t.status NOT IN ('Completed','Cancelled') AND t.due_date IS NOT NULL AND date(t.due_date) < date(@today)");
        break;
      case 'upcoming':
        where.push("t.status NOT IN ('Completed','Cancelled') AND t.due_date IS NOT NULL AND date(t.due_date) > date(@today)");
        break;
      case 'open':
        where.push("t.status NOT IN ('Completed','Cancelled')");
        break;
      case 'completed':
        where.push("t.status = 'Completed'");
        break;
      default:
        break;
    }

    const sql = where.length ? where.join(' AND ') : '1 = 1';
    const page = Math.max(1, int(req.query.page, 'page') || 1);
    const perPage = Math.min(200, Math.max(1, int(req.query.per_page, 'per_page') || 50));

    const total = db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE ${sql}`).get(params).n;
    const rows = db
      .prepare(`${SELECT} WHERE ${sql} ${ORDER} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: perPage, offset: (page - 1) * perPage });

    res.json({ data: rows, page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
  })
);

/** Counts for the task tabs, computed the same way the lists are. */
router.get(
  '/counts',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const mine = req.query.scope === 'mine' || !canSeeTeam(req.user);
    const ids = mine ? [req.user.id] : scope;
    const clause = Array.isArray(ids) ? `AND t.assigned_to IN (${ids.map(Number).join(',')})` : '';
    const today = new Date().toISOString().slice(0, 10);

    const count = (extra, p = {}) =>
      db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE 1 = 1 ${clause} AND ${extra}`).get({ today, ...p }).n;

    res.json({
      open: count("t.status NOT IN ('Completed','Cancelled')"),
      today: count("t.status NOT IN ('Completed','Cancelled') AND date(t.due_date) = date(@today)"),
      overdue: count("t.status NOT IN ('Completed','Cancelled') AND t.due_date IS NOT NULL AND date(t.due_date) < date(@today)"),
      upcoming: count("t.status NOT IN ('Completed','Cancelled') AND t.due_date IS NOT NULL AND date(t.due_date) > date(@today)"),
      completed: count("t.status = 'Completed'"),
    });
  })
);

router.get(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
    if (!row) throw notFound('Task not found');
    if (!canSeeTeam(req.user) && row.assigned_to !== req.user.id && row.created_by !== req.user.id) {
      throw notFound('Task not found');
    }
    res.json(row);
  })
);

router.post(
  '/',
  handle((req, res) => {
    const f = {
      title: str(req.body.title, 'title', { required: true, max: 300 }),
      description: str(req.body.description, 'description', { max: 10000 }),
      assigned_to: refId(db, 'users', req.body.assigned_to, 'assigned_to'),
      created_by: req.user.id,
      lead_id: refId(db, 'leads', req.body.lead_id, 'lead_id'),
      due_date: dateStr(req.body.due_date, 'due_date'),
      priority: oneOf(req.body.priority, 'priority', TASK_PRIORITIES) || 'Medium',
      status: oneOf(req.body.status, 'status', TASK_STATUSES) || 'To Do',
    };

    /* A salesperson can only give work to themselves. */
    if (!canSeeTeam(req.user)) {
      if (f.assigned_to != null && f.assigned_to !== req.user.id) {
        throw forbidden('You can only assign tasks to yourself');
      }
      f.assigned_to = req.user.id;
    }
    f.assigned_to ??= req.user.id;

    if (f.status === 'Completed') f.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const cols = Object.keys(f);
    const info = db
      .prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`)
      .run(f);

    res.status(201).json(db.prepare(`${SELECT} WHERE t.id = ?`).get(info.lastInsertRowid));
  })
);

router.patch(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) throw notFound('Task not found');

    const ownIt = existing.assigned_to === req.user.id || existing.created_by === req.user.id;
    if (!canSeeTeam(req.user) && !ownIt) throw notFound('Task not found');

    const patch = {};
    if ('title' in req.body) patch.title = str(req.body.title, 'title', { required: true, max: 300 });
    if ('description' in req.body) patch.description = str(req.body.description, 'description', { max: 10000 });
    if ('due_date' in req.body) patch.due_date = dateStr(req.body.due_date, 'due_date');
    if ('priority' in req.body) patch.priority = oneOf(req.body.priority, 'priority', TASK_PRIORITIES, { required: true });
    if ('lead_id' in req.body) patch.lead_id = refId(db, 'leads', req.body.lead_id, 'lead_id');
    if ('status' in req.body) patch.status = oneOf(req.body.status, 'status', TASK_STATUSES, { required: true });

    if ('assigned_to' in req.body) {
      const to = refId(db, 'users', req.body.assigned_to, 'assigned_to');
      if (!canSeeTeam(req.user) && to !== req.user.id) throw forbidden('You can only assign tasks to yourself');
      patch.assigned_to = to;
    }

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    /* completed_at is derived from status, never set by the client. */
    if ('status' in patch) {
      patch.completed_at =
        patch.status === 'Completed'
          ? existing.completed_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
          : null;
    }

    db.prepare(
      `UPDATE tasks SET ${Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')},
       updated_at = datetime('now') WHERE id = @id`
    ).run({ ...patch, id });

    res.json(db.prepare(`${SELECT} WHERE t.id = ?`).get(id));
  })
);

router.post(
  '/bulk/status',
  handle((req, res) => {
    const ids = idList(req.body.ids, 'ids');
    const status = oneOf(req.body.status, 'status', TASK_STATUSES, { required: true });

    if (!canSeeTeam(req.user)) {
      const mine = db
        .prepare(`SELECT COUNT(*) AS n FROM tasks WHERE id IN (${ids.map(() => '?').join(',')}) AND assigned_to = ?`)
        .get(...ids, req.user.id).n;
      if (mine !== ids.length) throw forbidden('Some of those tasks are not yours');
    }

    const completedAt = status === 'Completed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
    db.prepare(
      `UPDATE tasks SET status = ?, completed_at = ?, updated_at = datetime('now')
        WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(status, completedAt, ...ids);

    res.json({ ok: true, updated: ids.length, status });
  })
);

router.delete(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) throw notFound('Task not found');

    const ownIt = existing.assigned_to === req.user.id || existing.created_by === req.user.id;
    if (!canSeeTeam(req.user) && !ownIt) throw notFound('Task not found');

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ ok: true, deleted: id });
  })
);

export default router;
