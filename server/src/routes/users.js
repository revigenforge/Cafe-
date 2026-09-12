import { Router } from 'express';
import db from '../db/index.js';
import { handle, notFound, badRequest } from '../middleware/errors.js';
import { requireRole, ROLES } from '../middleware/auth.js';
import { str, int, bool, email, oneOf } from '../middleware/validate.js';

const router = Router();

const SELECT = `SELECT id, name, email, role, active, created_at, updated_at FROM users`;

/** Open to everyone — the UI needs names to show lead ownership. */
router.get(
  '/',
  handle((req, res) => {
    const includeInactive = req.query.include_inactive === 'true';
    const rows = db
      .prepare(`${SELECT} ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY role, name`)
      .all();
    res.json(rows);
  })
);

router.get(
  '/:id',
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
    if (!row) throw notFound('User not found');
    res.json(row);
  })
);

router.post(
  '/',
  requireRole('ADMIN'),
  handle((req, res) => {
    const name = str(req.body.name, 'name', { required: true, max: 120 });
    const mail = email(req.body.email, 'email', { required: true });
    const role = oneOf(req.body.role, 'role', ROLES, { required: true });

    const clash = db.prepare('SELECT id FROM users WHERE email = ?').get(mail);
    if (clash) throw badRequest('A user with that email already exists');

    const info = db
      .prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)')
      .run(name, mail, role);
    res.status(201).json(db.prepare(`${SELECT} WHERE id = ?`).get(info.lastInsertRowid));
  })
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) throw notFound('User not found');

    const patch = {};
    if ('name' in req.body) patch.name = str(req.body.name, 'name', { required: true, max: 120 });
    if ('email' in req.body) patch.email = email(req.body.email, 'email', { required: true });
    if ('role' in req.body) patch.role = oneOf(req.body.role, 'role', ROLES, { required: true });
    if ('active' in req.body) patch.active = bool(req.body.active, 'active', { required: true });

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    /* Locking out the last admin would leave nobody able to manage
       users or settings, and no way back in. */
    if ((patch.role && patch.role !== 'ADMIN') || patch.active === 0) {
      if (existing.role === 'ADMIN' && existing.active) {
        const others = db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND active = 1 AND id != ?")
          .get(id).n;
        if (others === 0) throw badRequest('This is the last active admin — promote someone else first');
      }
    }

    if (patch.email) {
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(patch.email, id);
      if (clash) throw badRequest('A user with that email already exists');
    }

    db.prepare(
      `UPDATE users SET ${Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')},
       updated_at = datetime('now') WHERE id = @id`
    ).run({ ...patch, id });

    res.json(db.prepare(`${SELECT} WHERE id = ?`).get(id));
  })
);

/**
 * Users are deactivated, never deleted — their name still has to appear
 * on the activities and leads they touched.
 */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  handle((req, res) => {
    const id = int(req.params.id, 'id', { required: true, min: 1 });
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) throw notFound('User not found');

    if (existing.role === 'ADMIN' && existing.active) {
      const others = db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND active = 1 AND id != ?")
        .get(id).n;
      if (others === 0) throw badRequest('This is the last active admin — promote someone else first');
    }

    const openLeads = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE owner_id = ?').get(id).n;
    db.prepare("UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);

    res.json({
      ok: true,
      deactivated: id,
      note: openLeads > 0 ? `${openLeads} lead(s) are still assigned to this user — reassign them` : undefined,
    });
  })
);

export default router;
