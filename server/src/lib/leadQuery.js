import { normalizePhone } from './phone.js';

/**
 * Turns query parameters into one parameterised WHERE clause.
 *
 * Filters combine with AND — picking a status and an owner means both,
 * never either. Every value is bound, never interpolated.
 */

const SORTABLE = {
  business_name: 'l.business_name',
  contact_name: 'l.contact_name',
  city: 'l.city',
  state: 'l.state',
  industry: 'l.industry',
  niche: 'l.niche',
  status: 's.sort_order',
  priority: 'p.weight',
  owner: 'u.name',
  source: 'src.name',
  estimated_value: 'l.estimated_value',
  created_at: 'l.created_at',
  updated_at: 'l.updated_at',
  last_activity_at: 'l.last_activity_at',
  next_follow_up_at: 'l.next_follow_up_at',
};

export const SORTABLE_FIELDS = Object.keys(SORTABLE);

export const LEAD_SELECT = `
  SELECT l.*,
         s.name   AS status_name,   s.color AS status_color, s.funnel_stage,
         s.is_won AS status_is_won, s.is_lost AS status_is_lost,
         p.name   AS priority_name, p.color AS priority_color, p.weight AS priority_weight,
         u.name   AS owner_name,    u.email AS owner_email,
         src.name AS source_name,
         (SELECT COUNT(*) FROM activities a WHERE a.lead_id = l.id) AS activity_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.lead_id = l.id
            AND t.status NOT IN ('Completed','Cancelled'))          AS open_task_count
    FROM leads l
    JOIN statuses s      ON s.id   = l.status_id
    LEFT JOIN priorities p   ON p.id   = l.priority_id
    LEFT JOIN users u        ON u.id   = l.owner_id
    LEFT JOIN lead_sources src ON src.id = l.source_id
`;

/**
 * @param {object} q                 request query
 * @param {number[]|null} ownerScope owner ids the caller may see, or null for all
 */
export function buildLeadFilter(q = {}, ownerScope = null) {
  const where = [];
  const params = {};

  // role scoping first — a salesperson can never widen this with a parameter
  if (Array.isArray(ownerScope)) {
    if (ownerScope.length === 0) return { sql: '1 = 0', params, joins: '' };
    where.push(`l.owner_id IN (${ownerScope.map(Number).join(',')})`);
  }

  // free-text search across the fields people actually recall
  if (q.search && String(q.search).trim()) {
    const raw = String(q.search).trim();
    const like = `%${raw}%`;
    params.q_like = like;
    const phone = normalizePhone(raw);
    if (phone) {
      params.q_phone = `%${phone}%`;
      where.push(`(l.business_name LIKE @q_like OR l.contact_name LIKE @q_like
                   OR l.email LIKE @q_like OR l.website LIKE @q_like
                   OR l.city LIKE @q_like OR l.state LIKE @q_like
                   OR l.notes LIKE @q_like OR l.normalized_phone LIKE @q_phone
                   OR l.phone LIKE @q_like)`);
    } else {
      where.push(`(l.business_name LIKE @q_like OR l.contact_name LIKE @q_like
                   OR l.email LIKE @q_like OR l.website LIKE @q_like
                   OR l.city LIKE @q_like OR l.state LIKE @q_like
                   OR l.notes LIKE @q_like OR l.phone LIKE @q_like)`);
    }
  }

  // multi-value filters: ?status_id=1&status_id=2 means either of those
  const multi = (key, col) => {
    if (q[key] == null || q[key] === '') return;
    const vals = (Array.isArray(q[key]) ? q[key] : String(q[key]).split(','))
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v));
    if (vals.length) where.push(`${col} IN (${vals.join(',')})`);
  };
  multi('status_id', 'l.status_id');
  multi('priority_id', 'l.priority_id');
  multi('source_id', 'l.source_id');

  // owner: an explicit id, or the literal "unassigned"
  if (q.owner_id != null && q.owner_id !== '') {
    if (String(q.owner_id) === 'unassigned') {
      where.push('l.owner_id IS NULL');
    } else {
      const vals = (Array.isArray(q.owner_id) ? q.owner_id : String(q.owner_id).split(','))
        .map(Number)
        .filter(Number.isInteger);
      if (vals.length) where.push(`l.owner_id IN (${vals.join(',')})`);
    }
  }

  const text = (key, col) => {
    if (q[key] == null || q[key] === '') return;
    params[key] = q[key];
    where.push(`${col} = @${key} COLLATE NOCASE`);
  };
  text('industry', 'l.industry');
  text('niche', 'l.niche');
  text('city', 'l.city');
  text('state', 'l.state');
  text('country', 'l.country');

  const dateRange = (key, col) => {
    if (q[`${key}_from`]) {
      params[`${key}_from`] = q[`${key}_from`];
      where.push(`date(${col}) >= date(@${key}_from)`);
    }
    if (q[`${key}_to`]) {
      params[`${key}_to`] = q[`${key}_to`];
      where.push(`date(${col}) <= date(@${key}_to)`);
    }
  };
  dateRange('created', 'l.created_at');
  dateRange('last_activity', 'l.last_activity_at');
  dateRange('follow_up', 'l.next_follow_up_at');

  if (q.has_email === 'true') where.push("l.email IS NOT NULL AND l.email != ''");
  if (q.has_email === 'false') where.push("(l.email IS NULL OR l.email = '')");
  if (q.has_website === 'true') where.push("l.website IS NOT NULL AND l.website != ''");
  if (q.has_website === 'false') where.push("(l.website IS NULL OR l.website = '')");
  if (q.has_phone === 'true') where.push('l.normalized_phone IS NOT NULL');

  // saved views used by the queue and the sidebar counts
  const today = new Date().toISOString().slice(0, 10);
  if (q.view === 'unassigned') where.push('l.owner_id IS NULL');
  if (q.view === 'follow_up_due') {
    params.today = today;
    where.push(`l.next_follow_up_at IS NOT NULL AND date(l.next_follow_up_at) <= date(@today)
                AND s.is_won = 0 AND s.is_lost = 0`);
  }
  if (q.view === 'follow_up_overdue') {
    params.today = today;
    where.push(`l.next_follow_up_at IS NOT NULL AND date(l.next_follow_up_at) < date(@today)
                AND s.is_won = 0 AND s.is_lost = 0`);
  }
  if (q.view === 'stale') {
    const days = Number(q.stale_days) > 0 ? Number(q.stale_days) : 7;
    params.stale_cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    where.push(`s.is_won = 0 AND s.is_lost = 0
                AND (l.last_activity_at IS NULL OR date(l.last_activity_at) < date(@stale_cutoff))`);
  }
  if (q.view === 'open') where.push('s.is_won = 0 AND s.is_lost = 0');

  return { sql: where.length ? where.join(' AND ') : '1 = 1', params };
}

/** Whitelisted ORDER BY — an unknown field falls back rather than injecting. */
export function buildLeadSort(sort = 'updated_at', dir = 'desc') {
  const col = SORTABLE[sort] || SORTABLE.updated_at;
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  // NULLs last regardless of direction, so empty follow-up dates don't lead
  return `ORDER BY (${col} IS NULL), ${col} ${direction}, l.id DESC`;
}
