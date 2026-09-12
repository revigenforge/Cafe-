import { Router } from 'express';
import db from '../db/index.js';
import { handle } from '../middleware/errors.js';
import { visibleOwnerIds } from '../middleware/auth.js';
import { normalizePhone } from '../lib/phone.js';

const router = Router();

/**
 * Global search across leads, tasks and people. Phone input is
 * normalised first, so "+91 98765 43210" finds a lead stored as
 * "098765 43210".
 */
router.get(
  '/',
  handle((req, res) => {
    const raw = String(req.query.q || '').trim();
    if (raw.length < 2) return res.json({ query: raw, leads: [], tasks: [], users: [] });

    const scope = visibleOwnerIds(req.user);
    const like = `%${raw}%`;
    const phone = normalizePhone(raw);
    const limit = 8;

    const ownerClause = Array.isArray(scope)
      ? scope.length
        ? `AND l.owner_id IN (${scope.map(Number).join(',')})`
        : 'AND 1 = 0'
      : '';

    const leads = db
      .prepare(
        `SELECT l.id, l.business_name, l.contact_name, l.phone, l.email, l.city, l.state,
                s.name AS status_name, s.color AS status_color, u.name AS owner_name
           FROM leads l
           JOIN statuses s ON s.id = l.status_id
           LEFT JOIN users u ON u.id = l.owner_id
          WHERE (l.business_name LIKE @like OR l.contact_name LIKE @like OR l.email LIKE @like
                 OR l.website LIKE @like OR l.city LIKE @like OR l.state LIKE @like
                 OR l.notes LIKE @like OR l.phone LIKE @like
                 ${phone ? 'OR l.normalized_phone LIKE @phone' : ''})
            ${ownerClause}
          ORDER BY l.updated_at DESC LIMIT @limit`
      )
      .all({ like, phone: phone ? `%${phone}%` : null, limit });

    const taskClause = Array.isArray(scope)
      ? scope.length
        ? `AND t.assigned_to IN (${scope.map(Number).join(',')})`
        : 'AND 1 = 0'
      : '';

    const tasks = db
      .prepare(
        `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.lead_id,
                u.name AS assigned_to_name
           FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
          WHERE (t.title LIKE @like OR t.description LIKE @like) ${taskClause}
          ORDER BY t.updated_at DESC LIMIT @limit`
      )
      .all({ like, limit });

    const users = db
      .prepare(
        `SELECT id, name, email, role FROM users
          WHERE active = 1 AND (name LIKE @like OR email LIKE @like)
          ORDER BY name LIMIT @limit`
      )
      .all({ like, limit });

    res.json({ query: raw, normalized_phone: phone, leads, tasks, users });
  })
);

/** Duplicate check used by the new-lead form before saving. */
router.get(
  '/duplicates',
  handle((req, res) => {
    const phone = normalizePhone(req.query.phone);
    const mail = String(req.query.email || '').trim().toLowerCase();
    if (!phone && !mail) return res.json({ matches: [] });

    const where = [];
    const params = {};
    if (phone) {
      where.push('l.normalized_phone = @phone');
      params.phone = phone;
    }
    if (mail) {
      where.push('lower(l.email) = @email');
      params.email = mail;
    }

    const matches = db
      .prepare(
        `SELECT l.id, l.business_name, l.phone, l.email, u.name AS owner_name, s.name AS status_name
           FROM leads l
           LEFT JOIN users u ON u.id = l.owner_id
           JOIN statuses s ON s.id = l.status_id
          WHERE ${where.join(' OR ')} LIMIT 10`
      )
      .all(params);

    res.json({ matches });
  })
);

export default router;
