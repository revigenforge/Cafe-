import { Router } from 'express';
import db from '../db/index.js';
import { handle, notFound, badRequest, forbidden } from '../middleware/errors.js';
import { visibleOwnerIds, assertLeadAccess, canAssign, canSeeTeam, requireRole } from '../middleware/auth.js';
import { str, int, num, email, dateStr, refId, idList } from '../middleware/validate.js';
import { normalizePhone } from '../lib/phone.js';
import { LEAD_SELECT, buildLeadFilter, buildLeadSort, SORTABLE_FIELDS } from '../lib/leadQuery.js';

const router = Router();

const defaultStatusId = () =>
  (db.prepare('SELECT id FROM statuses WHERE is_default = 1 ORDER BY sort_order LIMIT 1').get() ||
    db.prepare('SELECT id FROM statuses WHERE active = 1 ORDER BY sort_order LIMIT 1').get()).id;

const defaultPriorityId = () =>
  db.prepare('SELECT id FROM priorities WHERE is_default = 1 ORDER BY sort_order LIMIT 1').get()?.id ?? null;

const getLead = (id) => db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(id);

/** Records a field change so the team feed can describe what happened. */
export function logEvent(leadId, userId, type, from, to) {
  db.prepare(
    `INSERT INTO lead_events (lead_id, user_id, event_type, from_value, to_value)
     VALUES (?, ?, ?, ?, ?)`
  ).run(leadId, userId ?? null, type, from == null ? null : String(from), to == null ? null : String(to));
}

const nameOf = (table, id) =>
  id == null ? null : db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id)?.name ?? null;

/* ── list ──────────────────────────────────────────────────── */

router.get(
  '/',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const { sql, params } = buildLeadFilter(req.query, scope);

    const page = Math.max(1, int(req.query.page, 'page') || 1);
    const perPage = Math.min(200, Math.max(1, int(req.query.per_page, 'per_page') || 50));
    const order = buildLeadSort(req.query.sort, req.query.dir);

    const total = db
      .prepare(
        `SELECT COUNT(*) AS n FROM leads l JOIN statuses s ON s.id = l.status_id WHERE ${sql}`
      )
      .get(params).n;

    const rows = db
      .prepare(`${LEAD_SELECT} WHERE ${sql} ${order} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: perPage, offset: (page - 1) * perPage });

    res.json({
      data: rows,
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
      sortable_fields: SORTABLE_FIELDS,
    });
  })
);

/** Distinct values for the filter dropdowns, scoped like the list itself. */
router.get(
  '/facets',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const clause = Array.isArray(scope)
      ? scope.length
        ? `WHERE owner_id IN (${scope.map(Number).join(',')})`
        : 'WHERE 1 = 0'
      : '';
    const distinct = (col) =>
      db
        .prepare(
          `SELECT DISTINCT ${col} AS v FROM leads ${clause}
            ${clause ? 'AND' : 'WHERE'} ${col} IS NOT NULL AND ${col} != ''
            ORDER BY ${col} COLLATE NOCASE LIMIT 500`
        )
        .all()
        .map((r) => r.v);

    res.json({
      industries: distinct('industry'),
      niches: distinct('niche'),
      cities: distinct('city'),
      states: distinct('state'),
      countries: distinct('country'),
    });
  })
);

/** CSV export of the current filter selection. */
router.get(
  '/export',
  handle((req, res) => {
    const scope = visibleOwnerIds(req.user);
    const { sql, params } = buildLeadFilter(req.query, scope);
    const order = buildLeadSort(req.query.sort, req.query.dir);
    const rows = db.prepare(`${LEAD_SELECT} WHERE ${sql} ${order} LIMIT 10000`).all(params);

    const cols = [
      'id', 'business_name', 'contact_name', 'phone', 'email', 'website',
      'address', 'city', 'state', 'country', 'industry', 'niche',
      'source_name', 'status_name', 'priority_name', 'owner_name',
      'estimated_value', 'notes', 'created_at', 'last_activity_at', 'next_follow_up_at',
    ];
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  })
);

/* ── single lead ───────────────────────────────────────────── */

router.get(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const lead = getLead(id);
    if (!lead) throw notFound('Lead not found');
    assertLeadAccess(req.user, lead.owner_id);

    const activities = db
      .prepare(
        `SELECT a.*, u.name AS user_name, at.name AS activity_type_name, o.name AS outcome_name,
                o.counts_as_contact
           FROM activities a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN activity_types at ON at.id = a.activity_type_id
           LEFT JOIN activity_outcomes o ON o.id = a.outcome_id
          WHERE a.lead_id = ? ORDER BY a.created_at DESC, a.id DESC`
      )
      .all(id);

    const tasks = db
      .prepare(
        `SELECT t.*, u.name AS assigned_to_name, c.name AS created_by_name
           FROM tasks t
           LEFT JOIN users u ON u.id = t.assigned_to
           LEFT JOIN users c ON c.id = t.created_by
          WHERE t.lead_id = ? ORDER BY
            CASE t.status WHEN 'To Do' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
            (t.due_date IS NULL), t.due_date`
      )
      .all(id);

    const events = db
      .prepare(
        `SELECT e.*, u.name AS user_name FROM lead_events e
           LEFT JOIN users u ON u.id = e.user_id
          WHERE e.lead_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 100`
      )
      .all(id);

    res.json({ ...lead, activities, tasks, events });
  })
);

/* ── create ────────────────────────────────────────────────── */

function readLeadBody(body, { isNew }) {
  const f = {
    business_name: str(body.business_name, 'business_name', { required: isNew, max: 200 }),
    contact_name: str(body.contact_name, 'contact_name', { max: 200 }),
    phone: str(body.phone, 'phone', { max: 40 }),
    email: email(body.email, 'email'),
    website: str(body.website, 'website', { max: 300 }),
    address: str(body.address, 'address', { max: 500 }),
    city: str(body.city, 'city', { max: 120 }),
    state: str(body.state, 'state', { max: 120 }),
    country: str(body.country, 'country', { max: 120 }),
    industry: str(body.industry, 'industry', { max: 120 }),
    niche: str(body.niche, 'niche', { max: 120 }),
    notes: str(body.notes, 'notes', { max: 20000 }),
    estimated_value: num(body.estimated_value, 'estimated_value', { min: 0 }),
    next_follow_up_at: dateStr(body.next_follow_up_at, 'next_follow_up_at'),
    source_id: refId(db, 'lead_sources', body.source_id, 'source_id'),
    status_id: refId(db, 'statuses', body.status_id, 'status_id'),
    priority_id: refId(db, 'priorities', body.priority_id, 'priority_id'),
    owner_id: refId(db, 'users', body.owner_id, 'owner_id'),
  };
  f.normalized_phone = f.phone ? normalizePhone(f.phone) : null;
  return f;
}

router.post(
  '/',
  handle((req, res) => {
    const f = readLeadBody(req.body, { isNew: true });

    f.status_id ??= defaultStatusId();
    f.priority_id ??= defaultPriorityId();

    /* A salesperson may only create leads for themselves — otherwise
       they could hand work to a colleague without a manager knowing. */
    if (!canAssign(req.user)) {
      if (f.owner_id != null && f.owner_id !== req.user.id) {
        throw forbidden('You can only create leads assigned to yourself');
      }
      f.owner_id = req.user.id;
    }

    const cols = Object.keys(f);
    const info = db
      .prepare(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`)
      .run(f);

    logEvent(info.lastInsertRowid, req.user.id, 'created', null, f.business_name);
    if (f.owner_id) logEvent(info.lastInsertRowid, req.user.id, 'assigned', null, nameOf('users', f.owner_id));

    res.status(201).json(getLead(info.lastInsertRowid));
  })
);

/* ── update ────────────────────────────────────────────────── */

router.patch(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!existing) throw notFound('Lead not found');
    assertLeadAccess(req.user, existing.owner_id);

    const f = readLeadBody(req.body, { isNew: false });
    const patch = {};
    for (const [k, v] of Object.entries(f)) {
      if (k === 'normalized_phone') continue;
      if (k in req.body) patch[k] = v;
    }
    if ('phone' in req.body) patch.normalized_phone = f.normalized_phone;

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    if ('owner_id' in patch && !canAssign(req.user) && patch.owner_id !== req.user.id) {
      throw forbidden('Only an admin or manager can reassign a lead');
    }

    db.prepare(
      `UPDATE leads SET ${Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')},
       updated_at = datetime('now') WHERE id = @id`
    ).run({ ...patch, id });

    if ('status_id' in patch && patch.status_id !== existing.status_id) {
      logEvent(id, req.user.id, 'status_changed', nameOf('statuses', existing.status_id), nameOf('statuses', patch.status_id));
    }
    if ('owner_id' in patch && patch.owner_id !== existing.owner_id) {
      logEvent(id, req.user.id, 'assigned', nameOf('users', existing.owner_id), nameOf('users', patch.owner_id));
    }
    if ('priority_id' in patch && patch.priority_id !== existing.priority_id) {
      logEvent(id, req.user.id, 'priority_changed', nameOf('priorities', existing.priority_id), nameOf('priorities', patch.priority_id));
    }

    res.json(getLead(id));
  })
);

router.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(id);
    if (!existing) throw notFound('Lead not found');
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    res.json({ ok: true, deleted: id });
  })
);

/* ── bulk ──────────────────────────────────────────────────── */

/** Restricts a bulk operation to rows the caller may actually touch. */
function assertBulkAccess(user, ids) {
  if (canSeeTeam(user)) return ids;
  const allowed = db
    .prepare(`SELECT id FROM leads WHERE id IN (${ids.map(() => '?').join(',')}) AND owner_id = ?`)
    .all(...ids, user.id)
    .map((r) => r.id);
  if (allowed.length !== ids.length) {
    throw forbidden('Some of those leads are not assigned to you');
  }
  return allowed;
}

router.post(
  '/bulk/assign',
  requireRole('ADMIN', 'MANAGER'),
  handle((req, res) => {
    const ids = idList(req.body.ids, 'ids');
    const ownerId =
      req.body.owner_id === null ? null : refId(db, 'users', req.body.owner_id, 'owner_id');

    const from = new Map(
      db.prepare(`SELECT id, owner_id FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
        .map((r) => [r.id, r.owner_id])
    );

    const run = db.transaction(() => {
      const upd = db.prepare("UPDATE leads SET owner_id = ?, updated_at = datetime('now') WHERE id = ?");
      for (const id of ids) {
        upd.run(ownerId, id);
        if (from.get(id) !== ownerId) {
          logEvent(id, req.user.id, 'assigned', nameOf('users', from.get(id)), nameOf('users', ownerId));
        }
      }
    });
    run();

    res.json({ ok: true, updated: ids.length, owner_id: ownerId });
  })
);

router.post(
  '/bulk/status',
  handle((req, res) => {
    const ids = assertBulkAccess(req.user, idList(req.body.ids, 'ids'));
    const statusId = refId(db, 'statuses', req.body.status_id, 'status_id', { required: true });

    const from = new Map(
      db.prepare(`SELECT id, status_id FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
        .map((r) => [r.id, r.status_id])
    );

    db.transaction(() => {
      const upd = db.prepare("UPDATE leads SET status_id = ?, updated_at = datetime('now') WHERE id = ?");
      for (const id of ids) {
        upd.run(statusId, id);
        if (from.get(id) !== statusId) {
          logEvent(id, req.user.id, 'status_changed', nameOf('statuses', from.get(id)), nameOf('statuses', statusId));
        }
      }
    })();

    res.json({ ok: true, updated: ids.length, status_id: statusId });
  })
);

router.post(
  '/bulk/priority',
  handle((req, res) => {
    const ids = assertBulkAccess(req.user, idList(req.body.ids, 'ids'));
    const priorityId =
      req.body.priority_id === null ? null : refId(db, 'priorities', req.body.priority_id, 'priority_id');

    db.transaction(() => {
      const upd = db.prepare("UPDATE leads SET priority_id = ?, updated_at = datetime('now') WHERE id = ?");
      for (const id of ids) upd.run(priorityId, id);
    })();

    res.json({ ok: true, updated: ids.length, priority_id: priorityId });
  })
);

router.post(
  '/bulk/delete',
  requireRole('ADMIN', 'MANAGER'),
  handle((req, res) => {
    const ids = idList(req.body.ids, 'ids');
    const info = db.prepare(`DELETE FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    res.json({ ok: true, deleted: info.changes });
  })
);

/** Phone numbers for the selected leads, for pasting into a dialler. */
router.post(
  '/bulk/phones',
  handle((req, res) => {
    const ids = assertBulkAccess(req.user, idList(req.body.ids, 'ids'));
    const rows = db
      .prepare(
        `SELECT business_name, phone, normalized_phone FROM leads
          WHERE id IN (${ids.map(() => '?').join(',')}) AND normalized_phone IS NOT NULL`
      )
      .all(...ids);
    res.json({ count: rows.length, phones: rows.map((r) => r.phone), rows });
  })
);

export default router;
