import { Router } from 'express';
import db from '../db/index.js';
import { handle, badRequest, notFound, conflict } from '../middleware/errors.js';
import { requireRole } from '../middleware/auth.js';
import { str, int, bool, oneOf } from '../middleware/validate.js';
import { METRIC_DEFINITIONS, FUNNEL_STAGES } from '../lib/metrics.js';

const router = Router();

/**
 * The five admin-editable lookup tables share one shape, so they share
 * one implementation. Each entry declares only what differs.
 */
const TABLES = {
  statuses: {
    table: 'statuses',
    label: 'Status',
    fields: (body, isNew) => ({
      name: str(body.name, 'name', { required: isNew, max: 60 }),
      color: str(body.color, 'color', { max: 30 }),
      sort_order: int(body.sort_order, 'sort_order', { min: 0 }),
      active: bool(body.active, 'active'),
      funnel_stage: body.funnel_stage === null || body.funnel_stage === ''
        ? null
        : oneOf(body.funnel_stage, 'funnel_stage', FUNNEL_STAGES.map((s) => s.code)),
      is_won: bool(body.is_won, 'is_won'),
      is_lost: bool(body.is_lost, 'is_lost'),
    }),
    /* A lead must always land somewhere, so the status used as the
       import/creation default can never be deleted or deactivated. */
    guardDelete: (row) => {
      if (row.is_default) throw badRequest('The default status cannot be removed');
      const n = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE status_id = ?').get(row.id).n;
      if (n > 0) throw conflict(`${n} lead(s) still use this status — move them first`);
    },
  },
  lead_sources: {
    table: 'lead_sources',
    label: 'Lead source',
    fields: (body, isNew) => ({
      name: str(body.name, 'name', { required: isNew, max: 60 }),
      sort_order: int(body.sort_order, 'sort_order', { min: 0 }),
      active: bool(body.active, 'active'),
    }),
  },
  priorities: {
    table: 'priorities',
    label: 'Priority',
    fields: (body, isNew) => ({
      name: str(body.name, 'name', { required: isNew, max: 60 }),
      color: str(body.color, 'color', { max: 30 }),
      weight: int(body.weight, 'weight', { min: 0 }),
      sort_order: int(body.sort_order, 'sort_order', { min: 0 }),
      active: bool(body.active, 'active'),
    }),
    guardDelete: (row) => {
      if (row.is_default) throw badRequest('The default priority cannot be removed');
    },
  },
  activity_types: {
    table: 'activity_types',
    label: 'Activity type',
    fields: (body, isNew) => ({
      name: str(body.name, 'name', { required: isNew, max: 60 }),
      sort_order: int(body.sort_order, 'sort_order', { min: 0 }),
      active: bool(body.active, 'active'),
    }),
  },
  activity_outcomes: {
    table: 'activity_outcomes',
    label: 'Activity outcome',
    fields: (body, isNew) => ({
      name: str(body.name, 'name', { required: isNew, max: 60 }),
      sort_order: int(body.sort_order, 'sort_order', { min: 0 }),
      active: bool(body.active, 'active'),
      counts_as_contact: bool(body.counts_as_contact, 'counts_as_contact'),
    }),
  },
};

const resolve = (name) => {
  const cfg = TABLES[name];
  if (!cfg) throw notFound(`No such settings collection: ${name}`);
  return cfg;
};

const listAll = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY sort_order, name`).all();

/**
 * Everything the frontend needs to render without hard-coding a single
 * status, source, priority, type or outcome. Fetched once on load.
 */
router.get(
  '/bootstrap',
  handle((req, res) => {
    res.json({
      statuses: listAll('statuses'),
      lead_sources: listAll('lead_sources'),
      priorities: listAll('priorities'),
      activity_types: listAll('activity_types'),
      activity_outcomes: listAll('activity_outcomes'),
      task_statuses: ['To Do', 'In Progress', 'Completed', 'Cancelled'],
      task_priorities: ['Low', 'Medium', 'High', 'Urgent'],
      funnel_stages: FUNNEL_STAGES,
      metric_definitions: METRIC_DEFINITIONS,
      current_user: req.user,
    });
  })
);

router.get(
  '/:collection',
  handle((req, res) => {
    const cfg = resolve(req.params.collection);
    res.json(listAll(cfg.table));
  })
);

router.post(
  '/:collection',
  requireRole('ADMIN'),
  handle((req, res) => {
    const cfg = resolve(req.params.collection);
    const f = cfg.fields(req.body, true);

    const cols = Object.keys(f).filter((k) => f[k] !== null);
    if (!cols.includes('name')) throw badRequest('name is required');

    const sql = `INSERT INTO ${cfg.table} (${cols.join(', ')})
                 VALUES (${cols.map((c) => `@${c}`).join(', ')})`;
    const info = db.prepare(sql).run(f);
    res.status(201).json(db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid));
  })
);

router.patch(
  '/:collection/:id',
  requireRole('ADMIN'),
  handle((req, res) => {
    const cfg = resolve(req.params.collection);
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    if (!row) throw notFound(`${cfg.label} not found`);

    const f = cfg.fields(req.body, false);
    const cols = Object.keys(f).filter((k) => f[k] !== null && k in req.body);
    if (cols.length === 0) throw badRequest('Nothing to update');

    /* Deactivating the default would leave new leads with nowhere to go. */
    if (row.is_default && f.active === 0) {
      throw badRequest(`The default ${cfg.label.toLowerCase()} cannot be deactivated`);
    }

    db.prepare(
      `UPDATE ${cfg.table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')},
       updated_at = datetime('now') WHERE id = @id`
    ).run({ ...f, id });

    res.json(db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id));
  })
);

router.delete(
  '/:collection/:id',
  requireRole('ADMIN'),
  handle((req, res) => {
    const cfg = resolve(req.params.collection);
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    if (!row) throw notFound(`${cfg.label} not found`);

    if (cfg.guardDelete) cfg.guardDelete(row);

    db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(id);
    res.json({ ok: true, deleted: id });
  })
);

export default router;
