/**
 * The browser-only CRM.
 *
 * Implements the same surface as api/client.js against an in-memory
 * store held in localStorage. The metric definitions, funnel logic and
 * filter semantics are ported from server/src/lib/metrics.js and
 * leadQuery.js verbatim, so a number shown here means exactly what it
 * means in the real, server-backed CRM.
 *
 * What it deliberately does NOT reproduce: authentication, multi-user
 * shared state, and durability. This is a demo of the interface.
 */
import { buildSeed } from './seed.js';
import { normalizePhone } from './phone.js';
import { parseCsv, guessMapping, IMPORTABLE_FIELDS } from './csv.js';

const KEY = 'crm.demo.v1';
const USER_KEY = 'crm.user_id';

/* ── store ─────────────────────────────────────────────────── */

let state = null;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or a full quota — the demo still works, it just
       will not survive a reload. Never break the page over it. */
  }
}

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.leads?.length) {
        state = parsed;
        return state;
      }
    }
  } catch { /* fall through to a fresh seed */ }
  state = buildSeed();
  save();
  return state;
}

export function resetDemo() {
  state = buildSeed();
  save();
}

const nextId = (kind) => {
  state.seq[kind] = (state.seq[kind] || 0) + 1;
  return state.seq[kind];
};

const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const dayOf = (v) => (v ? String(v).slice(0, 10) : null);

/* ── acting user & permissions ─────────────────────────────── */

const actingId = () => Number(localStorage.getItem(USER_KEY)) || null;
const actingUser = () => state.users.find((u) => u.id === actingId()) ?? null;
const canSeeTeam = (u) => u && (u.role === 'ADMIN' || u.role === 'MANAGER');
const canAssign = canSeeTeam;

class DemoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, msg) => { throw new DemoError(status, msg); };

/** Owner ids the acting user may see; null means no restriction. */
const scope = () => {
  const u = actingUser();
  if (!u) fail(401, 'Not signed in');
  return canSeeTeam(u) ? null : [u.id];
};

/* ── joins ─────────────────────────────────────────────────── */

const find = (coll, id) => state[coll].find((x) => x.id === id) ?? null;
const nameOf = (coll, id) => find(coll, id)?.name ?? null;

function enrichLead(l) {
  const s = find('statuses', l.status_id) ?? {};
  const p = find('priorities', l.priority_id) ?? {};
  const o = find('users', l.owner_id) ?? {};
  const src = find('lead_sources', l.source_id) ?? {};
  return {
    ...l,
    status_name: s.name, status_color: s.color, funnel_stage: s.funnel_stage,
    status_is_won: s.is_won, status_is_lost: s.is_lost,
    priority_name: p.name ?? null, priority_color: p.color ?? null, priority_weight: p.weight ?? 0,
    owner_name: o.name ?? null, owner_email: o.email ?? null,
    source_name: src.name ?? null,
    activity_count: state.activities.filter((a) => a.lead_id === l.id).length,
    open_task_count: state.tasks.filter((t) => t.lead_id === l.id && !['Completed', 'Cancelled'].includes(t.status)).length,
  };
}

const enrichActivity = (a) => ({
  ...a,
  user_name: nameOf('users', a.user_id),
  activity_type_name: nameOf('activity_types', a.activity_type_id),
  outcome_name: nameOf('activity_outcomes', a.outcome_id),
  counts_as_contact: find('activity_outcomes', a.outcome_id)?.counts_as_contact ?? 0,
  lead_business_name: find('leads', a.lead_id)?.business_name ?? null,
  lead_owner_id: find('leads', a.lead_id)?.owner_id ?? null,
});

const enrichTask = (t) => ({
  ...t,
  assigned_to_name: nameOf('users', t.assigned_to),
  created_by_name: nameOf('users', t.created_by),
  lead_business_name: find('leads', t.lead_id)?.business_name ?? null,
});

/* ── lead filtering — ported from lib/leadQuery.js ─────────── */

function filterLeads(q = {}) {
  const sc = scope();
  const today = todayISO();
  let rows = state.leads.map(enrichLead);

  if (Array.isArray(sc)) rows = rows.filter((l) => sc.includes(l.owner_id));

  if (q.search && String(q.search).trim()) {
    const raw = String(q.search).trim().toLowerCase();
    const phone = normalizePhone(raw);
    rows = rows.filter((l) => {
      const hay = [l.business_name, l.contact_name, l.email, l.website, l.city, l.state, l.notes, l.phone]
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(raw)) return true;
      return phone && l.normalized_phone && l.normalized_phone.includes(phone);
    });
  }

  const multi = (key, field) => {
    if (q[key] == null || q[key] === '') return;
    const vals = String(q[key]).split(',').map(Number).filter(Number.isInteger);
    if (vals.length) rows = rows.filter((l) => vals.includes(l[field]));
  };
  multi('status_id', 'status_id');
  multi('priority_id', 'priority_id');
  multi('source_id', 'source_id');

  if (q.owner_id != null && q.owner_id !== '') {
    if (String(q.owner_id) === 'unassigned') rows = rows.filter((l) => l.owner_id == null);
    else {
      const vals = String(q.owner_id).split(',').map(Number).filter(Number.isInteger);
      if (vals.length) rows = rows.filter((l) => vals.includes(l.owner_id));
    }
  }

  const text = (key) => {
    if (!q[key]) return;
    const v = String(q[key]).toLowerCase();
    rows = rows.filter((l) => String(l[key] ?? '').toLowerCase() === v);
  };
  ['industry', 'niche', 'city', 'state', 'country'].forEach(text);

  const range = (key, field) => {
    if (q[`${key}_from`]) rows = rows.filter((l) => l[field] && dayOf(l[field]) >= q[`${key}_from`]);
    if (q[`${key}_to`]) rows = rows.filter((l) => l[field] && dayOf(l[field]) <= q[`${key}_to`]);
  };
  range('created', 'created_at');
  range('last_activity', 'last_activity_at');
  range('follow_up', 'next_follow_up_at');

  if (q.has_email === 'true') rows = rows.filter((l) => l.email);
  if (q.has_email === 'false') rows = rows.filter((l) => !l.email);
  if (q.has_website === 'true') rows = rows.filter((l) => l.website);
  if (q.has_website === 'false') rows = rows.filter((l) => !l.website);
  if (q.has_phone === 'true') rows = rows.filter((l) => l.normalized_phone);

  const open = (l) => !l.status_is_won && !l.status_is_lost;
  switch (q.view) {
    case 'unassigned': rows = rows.filter((l) => l.owner_id == null); break;
    case 'follow_up_due': rows = rows.filter((l) => l.next_follow_up_at && dayOf(l.next_follow_up_at) <= today && open(l)); break;
    case 'follow_up_overdue': rows = rows.filter((l) => l.next_follow_up_at && dayOf(l.next_follow_up_at) < today && open(l)); break;
    case 'stale': {
      const cutoff = daysAgoISO(Number(q.stale_days) > 0 ? Number(q.stale_days) : 7);
      rows = rows.filter((l) => open(l) && (!l.last_activity_at || dayOf(l.last_activity_at) < cutoff));
      break;
    }
    case 'open': rows = rows.filter(open); break;
    default: break;
  }

  return rows;
}

const SORTERS = {
  business_name: (l) => l.business_name?.toLowerCase(),
  contact_name: (l) => l.contact_name?.toLowerCase(),
  city: (l) => l.city?.toLowerCase(),
  state: (l) => l.state?.toLowerCase(),
  industry: (l) => l.industry?.toLowerCase(),
  niche: (l) => l.niche?.toLowerCase(),
  status: (l) => find('statuses', l.status_id)?.sort_order ?? 0,
  priority: (l) => l.priority_weight ?? 0,
  owner: (l) => l.owner_name?.toLowerCase(),
  source: (l) => l.source_name?.toLowerCase(),
  estimated_value: (l) => l.estimated_value,
  created_at: (l) => l.created_at,
  updated_at: (l) => l.updated_at,
  last_activity_at: (l) => l.last_activity_at,
  next_follow_up_at: (l) => l.next_follow_up_at,
};

function sortLeads(rows, sort = 'updated_at', dir = 'desc') {
  const key = SORTERS[sort] ?? SORTERS.updated_at;
  const mul = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    // nulls last regardless of direction, matching the SQL
    if (va == null && vb == null) return b.id - a.id;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return b.id - a.id;
  });
}

const paginate = (rows, page, perPage) => ({
  data: rows.slice((page - 1) * perPage, page * perPage),
  page,
  per_page: perPage,
  total: rows.length,
  total_pages: Math.max(1, Math.ceil(rows.length / perPage)),
});

/* ── metrics — ported from lib/metrics.js ──────────────────── */

export const FUNNEL_STAGES = [
  { code: 'NEW', label: 'New' },
  { code: 'CONTACTED', label: 'Contacted' },
  { code: 'INTERESTED', label: 'Interested' },
  { code: 'MEETING', label: 'Meeting' },
  { code: 'PROPOSAL', label: 'Proposal' },
  { code: 'NEGOTIATION', label: 'Negotiation' },
  { code: 'CONVERTED', label: 'Converted' },
];
const STAGE_ORDER = Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s.code, i]));
const stagesFrom = (code) => FUNNEL_STAGES.filter((s) => STAGE_ORDER[s.code] >= STAGE_ORDER[code]).map((s) => s.code);

export const METRIC_DEFINITIONS = {
  outreach_attempt: 'Every saved activity record, regardless of type or outcome. One logged action = one attempt.',
  contacted_lead: 'A lead with at least one activity whose outcome is marked "counts as contact" in Settings.',
  contact_rate: 'Contacted leads ÷ total leads in scope.',
  interest_rate: 'Leads that reached the Interested stage or beyond ÷ total leads in scope.',
  meeting_rate: 'Leads that reached the Meeting stage or beyond ÷ total leads in scope.',
  conversion_rate: 'Leads in a status flagged "won" ÷ total leads in scope.',
  follow_up_due: 'Lead has next_follow_up_at on or before the end of today and is not won or lost.',
  follow_up_overdue: 'Lead has next_follow_up_at before the start of today and is not won or lost.',
  task_overdue: 'Task has a due date before today and its status is neither Completed nor Cancelled.',
  stale_lead: 'Lead has had no activity for the configured number of days (default 7) and is not won or lost.',
  working_day: 'A calendar day on which a salesperson logged at least one activity.',
};

const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Applies the analytics filter set to the raw lead list. */
function scopedLeads(f = {}) {
  const sc = scope();
  let rows = state.leads.map(enrichLead);
  if (Array.isArray(sc)) rows = rows.filter((l) => sc.includes(l.owner_id));
  if (f.owner_id != null && f.owner_id !== '') rows = rows.filter((l) => l.owner_id === Number(f.owner_id));
  if (f.date_from) rows = rows.filter((l) => dayOf(l.created_at) >= f.date_from);
  if (f.date_to) rows = rows.filter((l) => dayOf(l.created_at) <= f.date_to);
  if (f.status_id) rows = rows.filter((l) => l.status_id === Number(f.status_id));
  if (f.source_id) rows = rows.filter((l) => l.source_id === Number(f.source_id));
  for (const k of ['niche', 'industry', 'state', 'city']) {
    if (f[k]) rows = rows.filter((l) => String(l[k] ?? '').toLowerCase() === String(f[k]).toLowerCase());
  }
  return rows;
}

function scopedActivities(f = {}) {
  const sc = scope();
  let rows = state.activities;
  if (Array.isArray(sc)) rows = rows.filter((a) => sc.includes(a.user_id));
  if (f.owner_id != null && f.owner_id !== '') rows = rows.filter((a) => a.user_id === Number(f.owner_id));
  if (f.date_from) rows = rows.filter((a) => dayOf(a.created_at) >= f.date_from);
  if (f.date_to) rows = rows.filter((a) => dayOf(a.created_at) <= f.date_to);
  return rows;
}

function summary(f = {}) {
  const leads = scopedLeads(f);
  const ids = new Set(leads.map((l) => l.id));
  const today = todayISO();
  const open = (l) => !l.status_is_won && !l.status_is_lost;

  const contactOutcomes = new Set(state.activity_outcomes.filter((o) => o.counts_as_contact).map((o) => o.id));
  const contacted = new Set(
    state.activities.filter((a) => ids.has(a.lead_id) && contactOutcomes.has(a.outcome_id)).map((a) => a.lead_id)
  ).size;

  const atStages = (codes) => leads.filter((l) => codes.includes(l.funnel_stage)).length;
  const total = leads.length;
  const interested = atStages(stagesFrom('INTERESTED'));
  const meetings = atStages(stagesFrom('MEETING'));
  const proposals = atStages(stagesFrom('PROPOSAL'));
  const converted = leads.filter((l) => l.status_is_won).length;

  const tasks = state.tasks.filter((t) => {
    const sc = scope();
    if (Array.isArray(sc) && !sc.includes(t.assigned_to)) return false;
    if (f.owner_id != null && f.owner_id !== '') return t.assigned_to === Number(f.owner_id);
    return true;
  });

  return {
    total_leads: total,
    new_leads: atStages(['NEW']),
    contacted_leads: contacted,
    interested_leads: interested,
    meetings_booked: meetings,
    proposals_sent: proposals,
    converted_leads: converted,
    lost_leads: leads.filter((l) => l.status_is_lost).length,
    follow_ups_due: leads.filter((l) => l.next_follow_up_at && dayOf(l.next_follow_up_at) <= today && open(l)).length,
    follow_ups_overdue: leads.filter((l) => l.next_follow_up_at && dayOf(l.next_follow_up_at) < today && open(l)).length,
    stale_leads: leads.filter((l) => open(l) && (!l.last_activity_at || dayOf(l.last_activity_at) < daysAgoISO(7))).length,
    total_activities: scopedActivities(f).length,
    tasks_completed: tasks.filter((t) => t.status === 'Completed').length,
    tasks_overdue: tasks.filter((t) => !['Completed', 'Cancelled'].includes(t.status) && t.due_date && t.due_date < today).length,
    contact_rate: rate(contacted, total),
    interest_rate: rate(interested, total),
    meeting_rate: rate(meetings, total),
    conversion_rate: rate(converted, total),
  };
}

/* ── event log ─────────────────────────────────────────────── */

function logEvent(leadId, type, from, to) {
  state.events.push({
    id: nextId('events'),
    lead_id: leadId,
    user_id: actingId(),
    event_type: type,
    from_value: from == null ? null : String(from),
    to_value: to == null ? null : String(to),
    created_at: nowStamp(),
  });
}

/* ── the API surface ───────────────────────────────────────── */

const ok = (v) => Promise.resolve(v);

export const demoApi = {
  qs: () => '',
  isDemo: true,
  resetDemo,

  health: () => ok({ ok: true, demo: true }),
  sessionUsers: () => { load(); return ok(state.users.filter((u) => u.active).map(({ id, name, email, role }) => ({ id, name, email, role }))); },

  bootstrap: () => {
    load();
    const u = actingUser();
    if (!u) return Promise.reject(new DemoError(401, 'Pick a user first'));
    return ok({
      statuses: state.statuses,
      lead_sources: state.lead_sources,
      priorities: state.priorities,
      activity_types: state.activity_types,
      activity_outcomes: state.activity_outcomes,
      task_statuses: ['To Do', 'In Progress', 'Completed', 'Cancelled'],
      task_priorities: ['Low', 'Medium', 'High', 'Urgent'],
      funnel_stages: FUNNEL_STAGES,
      metric_definitions: METRIC_DEFINITIONS,
      current_user: u,
    });
  },

  users: {
    list: () => ok(state.users.filter((u) => u.active)),
    create: (b) => {
      if (actingUser()?.role !== 'ADMIN') fail(403, 'Admins only');
      const u = { id: nextId('users'), name: b.name, email: b.email, role: b.role, active: 1 };
      state.users.push(u); save();
      return ok(u);
    },
    update: (id, b) => {
      if (actingUser()?.role !== 'ADMIN') fail(403, 'Admins only');
      const u = find('users', id) ?? fail(404, 'User not found');
      if ((b.role && b.role !== 'ADMIN') || b.active === 0) {
        const others = state.users.filter((x) => x.role === 'ADMIN' && x.active && x.id !== id).length;
        if (u.role === 'ADMIN' && u.active && others === 0) fail(400, 'This is the last active admin');
      }
      Object.assign(u, b); save();
      return ok(u);
    },
    deactivate: (id) => demoApi.users.update(id, { active: 0 }),
  },

  settings: {
    list: (c) => ok(state[c] ?? fail(404, `No such collection: ${c}`)),
    create: (c, b) => {
      if (actingUser()?.role !== 'ADMIN') fail(403, 'Admins only');
      const row = { id: nextId('lookup'), active: 1, sort_order: 0, color: 'slate', ...b };
      state[c].push(row); save();
      return ok(row);
    },
    update: (c, id, b) => {
      if (actingUser()?.role !== 'ADMIN') fail(403, 'Admins only');
      const row = state[c].find((x) => x.id === id) ?? fail(404, 'Not found');
      if (row.is_default && b.active === 0) fail(400, 'The default cannot be deactivated');
      Object.assign(row, b); save();
      return ok(row);
    },
    remove: (c, id) => {
      if (actingUser()?.role !== 'ADMIN') fail(403, 'Admins only');
      const row = state[c].find((x) => x.id === id) ?? fail(404, 'Not found');
      if (row.is_default) fail(400, 'The default cannot be removed');
      if (c === 'statuses') {
        const n = state.leads.filter((l) => l.status_id === id).length;
        if (n) fail(409, `${n} lead(s) still use this status — move them first`);
      }
      state[c] = state[c].filter((x) => x.id !== id); save();
      return ok({ ok: true, deleted: id });
    },
  },

  leads: {
    list: (q = {}) => {
      load();
      const page = Math.max(1, Number(q.page) || 1);
      const perPage = Math.min(200, Math.max(1, Number(q.per_page) || 50));
      const rows = sortLeads(filterLeads(q), q.sort, q.dir);
      return ok(paginate(rows, page, perPage));
    },

    facets: () => {
      const sc = scope();
      const rows = Array.isArray(sc) ? state.leads.filter((l) => sc.includes(l.owner_id)) : state.leads;
      const distinct = (k) => [...new Set(rows.map((l) => l[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return ok({
        industries: distinct('industry'), niches: distinct('niche'),
        cities: distinct('city'), states: distinct('state'), countries: distinct('country'),
      });
    },

    get: (id) => {
      const l = find('leads', Number(id)) ?? fail(404, 'Lead not found');
      const u = actingUser();
      if (!canSeeTeam(u) && l.owner_id !== u.id) fail(403, 'That lead is not assigned to you');
      const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
      return ok({
        ...enrichLead(l),
        activities: state.activities.filter((a) => a.lead_id === l.id).map(enrichActivity).sort(byNewest),
        tasks: state.tasks.filter((t) => t.lead_id === l.id).map(enrichTask),
        events: state.events.filter((e) => e.lead_id === l.id)
          .map((e) => ({ ...e, user_name: nameOf('users', e.user_id) })).sort(byNewest),
      });
    },

    create: (b) => {
      const u = actingUser();
      const defStatus = state.statuses.find((s) => s.is_default) ?? state.statuses[0];
      const defPriority = state.priorities.find((p) => p.is_default);
      let ownerId = b.owner_id ?? null;
      if (!canAssign(u)) ownerId = u.id;

      if (!b.business_name?.trim()) fail(400, 'A lead needs a business name');

      const lead = {
        id: nextId('leads'),
        business_name: b.business_name.trim(),
        contact_name: b.contact_name || null,
        phone: b.phone || null,
        normalized_phone: b.phone ? normalizePhone(b.phone) : null,
        email: b.email ? String(b.email).toLowerCase() : null,
        website: b.website || null,
        address: b.address || null,
        city: b.city || null,
        state: b.state || null,
        country: b.country || null,
        industry: b.industry || null,
        niche: b.niche || null,
        source_id: b.source_id ?? null,
        status_id: b.status_id ?? defStatus.id,
        priority_id: b.priority_id ?? defPriority?.id ?? null,
        owner_id: ownerId,
        estimated_value: b.estimated_value ?? null,
        notes: b.notes || null,
        created_at: nowStamp(),
        updated_at: nowStamp(),
        last_activity_at: null,
        next_follow_up_at: b.next_follow_up_at || null,
      };
      state.leads.push(lead);
      logEvent(lead.id, 'created', null, lead.business_name);
      if (lead.owner_id) logEvent(lead.id, 'assigned', null, nameOf('users', lead.owner_id));
      save();
      return ok(enrichLead(lead));
    },

    update: (id, b) => {
      const l = find('leads', Number(id)) ?? fail(404, 'Lead not found');
      const u = actingUser();
      if (!canSeeTeam(u) && l.owner_id !== u.id) fail(403, 'That lead is not assigned to you');
      if ('owner_id' in b && !canAssign(u) && b.owner_id !== u.id) fail(403, 'Only an admin or manager can reassign');

      const before = { ...l };
      for (const [k, v] of Object.entries(b)) {
        if (k === 'normalized_phone') continue;
        if (k in l) l[k] = v === '' ? null : v;
      }
      if ('phone' in b) l.normalized_phone = b.phone ? normalizePhone(b.phone) : null;
      l.updated_at = nowStamp();

      if (b.status_id != null && b.status_id !== before.status_id) {
        logEvent(l.id, 'status_changed', nameOf('statuses', before.status_id), nameOf('statuses', l.status_id));
      }
      if ('owner_id' in b && b.owner_id !== before.owner_id) {
        logEvent(l.id, 'assigned', nameOf('users', before.owner_id), nameOf('users', l.owner_id));
      }
      if ('priority_id' in b && b.priority_id !== before.priority_id) {
        logEvent(l.id, 'priority_changed', nameOf('priorities', before.priority_id), nameOf('priorities', l.priority_id));
      }
      save();
      return ok(enrichLead(l));
    },

    remove: (id) => {
      if (!canSeeTeam(actingUser())) fail(403, 'Only an admin or manager can delete a lead');
      const n = Number(id);
      state.leads = state.leads.filter((l) => l.id !== n);
      state.activities = state.activities.filter((a) => a.lead_id !== n);
      state.events = state.events.filter((e) => e.lead_id !== n);
      state.tasks.forEach((t) => { if (t.lead_id === n) t.lead_id = null; });
      save();
      return ok({ ok: true, deleted: n });
    },

    bulkAssign: (ids, ownerId) => {
      if (!canAssign(actingUser())) fail(403, 'Only an admin or manager can assign leads');
      ids.forEach((id) => {
        const l = find('leads', id);
        if (!l || l.owner_id === ownerId) return;
        logEvent(id, 'assigned', nameOf('users', l.owner_id), nameOf('users', ownerId));
        l.owner_id = ownerId;
        l.updated_at = nowStamp();
      });
      save();
      return ok({ ok: true, updated: ids.length, owner_id: ownerId });
    },

    bulkStatus: (ids, statusId) => {
      ids.forEach((id) => {
        const l = find('leads', id);
        if (!l || l.status_id === statusId) return;
        logEvent(id, 'status_changed', nameOf('statuses', l.status_id), nameOf('statuses', statusId));
        l.status_id = statusId;
        l.updated_at = nowStamp();
      });
      save();
      return ok({ ok: true, updated: ids.length, status_id: statusId });
    },

    bulkPriority: (ids, priorityId) => {
      ids.forEach((id) => {
        const l = find('leads', id);
        if (l) { l.priority_id = priorityId; l.updated_at = nowStamp(); }
      });
      save();
      return ok({ ok: true, updated: ids.length, priority_id: priorityId });
    },

    bulkDelete: (ids) => {
      if (!canSeeTeam(actingUser())) fail(403, 'Only an admin or manager can delete leads');
      ids.forEach((id) => demoApi.leads.remove(id));
      return ok({ ok: true, deleted: ids.length });
    },

    phones: (ids) => {
      const rows = ids.map((id) => find('leads', id)).filter((l) => l && l.normalized_phone);
      return ok({ count: rows.length, phones: rows.map((r) => r.phone), rows });
    },

    /* The real build streams a file from the server; here the CSV is
       made in the page and handed over as a blob. */
    exportUrl: (q = {}) => {
      const rows = sortLeads(filterLeads(q), q.sort, q.dir);
      const cols = ['id', 'business_name', 'contact_name', 'phone', 'email', 'website', 'address',
        'city', 'state', 'country', 'industry', 'niche', 'source_name', 'status_name',
        'priority_name', 'owner_name', 'estimated_value', 'notes', 'created_at',
        'last_activity_at', 'next_follow_up_at'];
      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
      return URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    },
  },

  activities: {
    list: (q = {}) => {
      const sc = scope();
      let rows = state.activities;
      if (Array.isArray(sc)) rows = rows.filter((a) => sc.includes(a.user_id));
      if (q.lead_id) rows = rows.filter((a) => a.lead_id === Number(q.lead_id));
      if (q.user_id) rows = rows.filter((a) => a.user_id === Number(q.user_id));
      if (q.date_from) rows = rows.filter((a) => dayOf(a.created_at) >= q.date_from);
      if (q.date_to) rows = rows.filter((a) => dayOf(a.created_at) <= q.date_to);
      rows = rows.map(enrichActivity).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return ok(paginate(rows, Math.max(1, Number(q.page) || 1), Math.min(200, Number(q.per_page) || 50)));
    },

    feed: (q = {}) => {
      const sc = scope();
      const limit = Math.min(200, Number(q.limit) || 60);
      const mine = (uid) => !Array.isArray(sc) || sc.includes(uid);

      const acts = state.activities.filter((a) => mine(a.user_id)).map((a) => ({
        kind: 'activity', id: a.id, created_at: a.created_at, notes: a.notes, lead_id: a.lead_id,
        user_name: nameOf('users', a.user_id),
        activity_type_name: nameOf('activity_types', a.activity_type_id),
        outcome_name: nameOf('activity_outcomes', a.outcome_id),
        business_name: find('leads', a.lead_id)?.business_name,
      }));

      const evts = state.events.filter((e) => mine(e.user_id)).map((e) => ({
        kind: 'event', id: e.id, created_at: e.created_at, event_type: e.event_type,
        from_value: e.from_value, to_value: e.to_value, lead_id: e.lead_id,
        user_name: nameOf('users', e.user_id),
        business_name: find('leads', e.lead_id)?.business_name,
      }));

      const done = state.tasks.filter((t) => t.status === 'Completed' && t.completed_at && mine(t.assigned_to))
        .map((t) => ({
          kind: 'task_completed', id: t.id, created_at: t.completed_at, title: t.title, lead_id: t.lead_id,
          user_name: nameOf('users', t.assigned_to),
          business_name: find('leads', t.lead_id)?.business_name,
        }));

      const merged = [...acts, ...evts, ...done]
        .filter((r) => r.created_at && r.business_name !== undefined)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
      return ok({ data: merged });
    },

    create: (b) => {
      const lead = find('leads', Number(b.lead_id)) ?? fail(404, 'Lead not found');
      const u = actingUser();
      if (!canSeeTeam(u) && lead.owner_id !== u.id) fail(403, 'That lead is not assigned to you');

      const a = {
        id: nextId('activities'),
        lead_id: lead.id,
        user_id: u.id,
        activity_type_id: b.activity_type_id ?? null,
        outcome_id: b.outcome_id ?? null,
        notes: b.notes || null,
        duration_minutes: b.duration_minutes ?? null,
        follow_up_date: b.follow_up_date || null,
        created_at: nowStamp(),
      };
      state.activities.push(a);

      lead.last_activity_at = a.created_at;
      if (a.follow_up_date) lead.next_follow_up_at = a.follow_up_date;
      lead.updated_at = nowStamp();

      if (b.status_id && b.status_id !== lead.status_id) {
        logEvent(lead.id, 'status_changed', nameOf('statuses', lead.status_id), nameOf('statuses', b.status_id));
        lead.status_id = b.status_id;
      }
      save();
      return ok(enrichActivity(a));
    },

    update: (id, b) => {
      const a = state.activities.find((x) => x.id === Number(id)) ?? fail(404, 'Activity not found');
      Object.assign(a, b); save();
      return ok(enrichActivity(a));
    },

    remove: (id) => {
      const a = state.activities.find((x) => x.id === Number(id)) ?? fail(404, 'Activity not found');
      state.activities = state.activities.filter((x) => x.id !== a.id);
      const lead = find('leads', a.lead_id);
      if (lead) {
        const rest = state.activities.filter((x) => x.lead_id === lead.id);
        lead.last_activity_at = rest.length
          ? rest.map((x) => x.created_at).sort().at(-1)
          : null;
      }
      save();
      return ok({ ok: true, deleted: a.id });
    },
  },

  tasks: {
    list: (q = {}) => {
      const sc = scope();
      const today = todayISO();
      let rows = state.tasks;
      if (Array.isArray(sc)) rows = rows.filter((t) => sc.includes(t.assigned_to));
      if (q.assigned_to) rows = rows.filter((t) => t.assigned_to === Number(q.assigned_to));
      if (q.lead_id) rows = rows.filter((t) => t.lead_id === Number(q.lead_id));
      if (q.status) {
        const list = String(q.status).split(',');
        rows = rows.filter((t) => list.includes(t.status));
      }
      const openT = (t) => !['Completed', 'Cancelled'].includes(t.status);
      switch (q.view) {
        case 'today': rows = rows.filter((t) => openT(t) && t.due_date === today); break;
        case 'overdue': rows = rows.filter((t) => openT(t) && t.due_date && t.due_date < today); break;
        case 'upcoming': rows = rows.filter((t) => openT(t) && t.due_date && t.due_date > today); break;
        case 'open': rows = rows.filter(openT); break;
        case 'completed': rows = rows.filter((t) => t.status === 'Completed'); break;
        default: break;
      }
      const rank = { 'To Do': 0, 'In Progress': 1, Completed: 2, Cancelled: 3 };
      const prank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
      rows = rows.map(enrichTask).sort((a, b) =>
        rank[a.status] - rank[b.status]
        || (a.due_date == null) - (b.due_date == null)
        || String(a.due_date).localeCompare(String(b.due_date))
        || prank[a.priority] - prank[b.priority]
        || b.id - a.id);
      return ok(paginate(rows, Math.max(1, Number(q.page) || 1), Math.min(200, Number(q.per_page) || 50)));
    },

    counts: (q = {}) => {
      const u = actingUser();
      const sc = scope();
      const mine = q.scope === 'mine' || !canSeeTeam(u);
      const ids = mine ? [u.id] : sc;
      const today = todayISO();
      let rows = state.tasks;
      if (Array.isArray(ids)) rows = rows.filter((t) => ids.includes(t.assigned_to));
      const openT = (t) => !['Completed', 'Cancelled'].includes(t.status);
      return ok({
        open: rows.filter(openT).length,
        today: rows.filter((t) => openT(t) && t.due_date === today).length,
        overdue: rows.filter((t) => openT(t) && t.due_date && t.due_date < today).length,
        upcoming: rows.filter((t) => openT(t) && t.due_date && t.due_date > today).length,
        completed: rows.filter((t) => t.status === 'Completed').length,
      });
    },

    create: (b) => {
      const u = actingUser();
      if (!b.title?.trim()) fail(400, 'Give the task a title');
      let assignee = b.assigned_to ?? u.id;
      if (!canSeeTeam(u) && assignee !== u.id) fail(403, 'You can only assign tasks to yourself');
      const t = {
        id: nextId('tasks'),
        title: b.title.trim(),
        description: b.description || null,
        assigned_to: assignee,
        created_by: u.id,
        lead_id: b.lead_id ?? null,
        due_date: b.due_date || null,
        priority: b.priority || 'Medium',
        status: b.status || 'To Do',
        completed_at: b.status === 'Completed' ? nowStamp() : null,
        created_at: nowStamp(),
        updated_at: nowStamp(),
      };
      state.tasks.push(t); save();
      return ok(enrichTask(t));
    },

    update: (id, b) => {
      const t = state.tasks.find((x) => x.id === Number(id)) ?? fail(404, 'Task not found');
      const u = actingUser();
      if (!canSeeTeam(u) && t.assigned_to !== u.id && t.created_by !== u.id) fail(404, 'Task not found');
      if ('assigned_to' in b && !canSeeTeam(u) && b.assigned_to !== u.id) fail(403, 'You can only assign tasks to yourself');
      Object.assign(t, b);
      if ('status' in b) t.completed_at = b.status === 'Completed' ? (t.completed_at || nowStamp()) : null;
      t.updated_at = nowStamp();
      save();
      return ok(enrichTask(t));
    },

    remove: (id) => {
      state.tasks = state.tasks.filter((t) => t.id !== Number(id)); save();
      return ok({ ok: true, deleted: Number(id) });
    },

    bulkStatus: (ids, status) => {
      ids.forEach((id) => {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        t.status = status;
        t.completed_at = status === 'Completed' ? nowStamp() : null;
        t.updated_at = nowStamp();
      });
      save();
      return ok({ ok: true, updated: ids.length, status });
    },
  },

  dashboard: {
    get: () => {
      load();
      const u = actingUser();
      const today = todayISO();
      const mine = state.leads.map(enrichLead).filter((l) => l.owner_id === u.id);
      const open = (l) => !l.status_is_won && !l.status_is_lost;

      const payload = {
        today, user: u,
        mine: {
          summary: summary({ owner_id: u.id }),
          follow_ups_today: mine.filter((l) => dayOf(l.next_follow_up_at) === today && open(l)).slice(0, 25),
          follow_ups_overdue: mine.filter((l) => l.next_follow_up_at && dayOf(l.next_follow_up_at) < today && open(l)).slice(0, 25),
          new_leads: mine.filter((l) => l.funnel_stage === 'NEW').slice(0, 25),
          stale_leads: mine.filter((l) => open(l) && (!l.last_activity_at || dayOf(l.last_activity_at) < daysAgoISO(7))).slice(0, 25),
          tasks_today: state.tasks.filter((t) => t.assigned_to === u.id && !['Completed', 'Cancelled'].includes(t.status)
            && t.due_date && t.due_date <= today).map(enrichTask).slice(0, 25),
          meetings_today: state.activities.filter((a) => a.user_id === u.id && dayOf(a.created_at) === today
            && nameOf('activity_types', a.activity_type_id) === 'Meeting')
            .map((a) => ({ ...enrichActivity(a), business_name: find('leads', a.lead_id)?.business_name })).slice(0, 25),
          recent_activity: state.activities.filter((a) => a.user_id === u.id)
            .map((a) => ({ ...enrichActivity(a), business_name: find('leads', a.lead_id)?.business_name }))
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 15),
        },
      };

      if (canSeeTeam(u)) {
        payload.team = {
          summary: summary({}),
          by_person: state.users.filter((x) => x.active && x.role !== 'ADMIN').map((x) => {
            const s = summary({ owner_id: x.id });
            return {
              user_id: x.id, name: x.name, role: x.role,
              leads: s.total_leads, contacted: s.contacted_leads, activities: s.total_activities,
              meetings: s.meetings_booked, converted: s.converted_leads,
              follow_ups_overdue: s.follow_ups_overdue, tasks_overdue: s.tasks_overdue,
              conversion_rate: s.conversion_rate,
            };
          }),
          unassigned_leads: state.leads.filter((l) => l.owner_id == null).length,
          activities_today: state.activities.filter((a) => dayOf(a.created_at) === today).length,
        };
      }
      return ok(payload);
    },

    queue: (q = {}) => {
      load();
      const u = actingUser();
      const today = todayISO();
      const cutoff = daysAgoISO(7);
      const sc = scope();
      let rows = state.leads.map(enrichLead).filter((l) => !l.status_is_won && !l.status_is_lost);

      if (q.owner_id && q.owner_id !== 'all') rows = rows.filter((l) => l.owner_id === Number(q.owner_id));
      else if (Array.isArray(sc)) rows = rows.filter((l) => sc.includes(l.owner_id));

      rows = rows.filter((l) =>
        (l.next_follow_up_at && dayOf(l.next_follow_up_at) <= today)
        || l.funnel_stage === 'NEW'
        || !l.last_activity_at
        || dayOf(l.last_activity_at) < cutoff);

      const bucket = (l) => {
        if (l.next_follow_up_at && dayOf(l.next_follow_up_at) < today) return 0;
        if (l.next_follow_up_at && dayOf(l.next_follow_up_at) === today) return 1;
        if (!l.last_activity_at && l.funnel_stage === 'NEW') return 2;
        if (!l.last_activity_at || dayOf(l.last_activity_at) < cutoff) return 3;
        return 4;
      };
      const reason = (l) => ['Follow-up overdue', 'Follow-up due today', 'New, never contacted', 'Never contacted', 'No activity for a while'][bucket(l)];

      rows.sort((a, b) =>
        bucket(a) - bucket(b)
        || (b.priority_weight ?? 0) - (a.priority_weight ?? 0)
        || (a.next_follow_up_at == null) - (b.next_follow_up_at == null)
        || String(a.next_follow_up_at).localeCompare(String(b.next_follow_up_at))
        || String(a.created_at).localeCompare(String(b.created_at)));

      const limit = Math.min(200, Number(q.limit) || 50);
      return ok({ today, data: rows.slice(0, limit).map((l) => ({ ...l, queue_reason: reason(l) })) });
    },
  },

  analytics: {
    summary: (f = {}) => ok({ filters: f, definitions: METRIC_DEFINITIONS, ...summary(f) }),

    funnel: (f = {}) => {
      const leads = scopedLeads(f);
      const total = leads.length;
      const stages = FUNNEL_STAGES.map((s) => {
        const codes = stagesFrom(s.code);
        const count = leads.filter((l) => codes.includes(l.funnel_stage)).length;
        return { code: s.code, label: s.label, count, pct_of_total: rate(count, total) };
      });
      stages.forEach((s, i) => {
        if (i === 0) { s.drop_off = 0; s.step_rate = 100; return; }
        s.drop_off = stages[i - 1].count - s.count;
        s.step_rate = rate(s.count, stages[i - 1].count);
      });
      return ok({ total_leads: total, stages, filters: f });
    },

    byStatus: (f = {}) => {
      const leads = scopedLeads(f);
      return ok({
        data: state.statuses.filter((s) => s.active).map((s) => {
          const rows = leads.filter((l) => l.status_id === s.id);
          return {
            id: s.id, name: s.name, color: s.color, sort_order: s.sort_order,
            funnel_stage: s.funnel_stage, is_won: s.is_won, is_lost: s.is_lost,
            count: rows.length,
            value: rows.reduce((n, l) => n + (l.estimated_value || 0), 0),
          };
        }),
      });
    },

    breakdown: (f = {}) => {
      const field = f.field || 'source';
      const key = {
        source: (l) => l.source_name || 'Unknown',
        industry: (l) => l.industry || 'Unknown',
        niche: (l) => l.niche || 'Unknown',
        state: (l) => l.state || 'Unknown',
        city: (l) => l.city || 'Unknown',
        owner: (l) => l.owner_name || 'Unassigned',
        priority: (l) => l.priority_name || 'None',
      }[field] ?? ((l) => l.source_name || 'Unknown');

      const map = new Map();
      scopedLeads(f).forEach((l) => {
        const k = key(l);
        const cur = map.get(k) ?? { label: k, count: 0, converted: 0 };
        cur.count++;
        if (l.status_is_won) cur.converted++;
        map.set(k, cur);
      });
      const data = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 30)
        .map((d) => ({ ...d, conversion_rate: rate(d.converted, d.count) }));
      return ok({ field, data });
    },

    trend: (f = {}) => {
      const map = new Map();
      scopedActivities(f).forEach((a) => {
        const d = dayOf(a.created_at);
        const cur = map.get(d) ?? { day: d, count: 0, leads: new Set(), people: new Set() };
        cur.count++; cur.leads.add(a.lead_id); cur.people.add(a.user_id);
        map.set(d, cur);
      });
      const data = [...map.values()]
        .sort((a, b) => a.day.localeCompare(b.day)).slice(-90)
        .map((d) => ({ day: d.day, count: d.count, leads_touched: d.leads.size, people: d.people.size }));
      return ok({ data });
    },

    performance: (f = {}) => {
      if (!canSeeTeam(actingUser())) fail(403, 'This needs the ADMIN or MANAGER role');
      const data = state.users.filter((u) => u.active && u.role !== 'ADMIN').map((u) => {
        const pf = { ...f, owner_id: u.id };
        const s = summary(pf);
        const acts = scopedActivities(pf);
        const days = new Set(acts.map((a) => dayOf(a.created_at))).size;
        return {
          user_id: u.id, name: u.name, email: u.email, role: u.role,
          leads_assigned: s.total_leads, leads_contacted: s.contacted_leads,
          activities_logged: s.total_activities, meetings_booked: s.meetings_booked,
          proposals_sent: s.proposals_sent, conversions: s.converted_leads,
          lost: s.lost_leads, follow_ups_overdue: s.follow_ups_overdue,
          tasks_completed: s.tasks_completed, tasks_overdue: s.tasks_overdue,
          contact_rate: s.contact_rate, conversion_rate: s.conversion_rate,
          working_days: days,
          activities_per_working_day: days > 0 ? Math.round((s.total_activities / days) * 10) / 10 : 0,
        };
      });
      return ok({ data, definitions: METRIC_DEFINITIONS, filters: f });
    },

    person: (id, f = {}) => {
      const u = actingUser();
      const target = Number(id);
      if (!canSeeTeam(u) && target !== u.id) fail(403, 'You can only view your own performance');
      const user = find('users', target) ?? fail(404, 'User not found');
      const pf = { ...f, owner_id: target };
      const acts = scopedActivities(pf);
      const group = (fn) => {
        const m = new Map();
        acts.forEach((a) => {
          const k = fn(a) || 'Unspecified';
          m.set(k, (m.get(k) ?? 0) + 1);
        });
        return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
      };
      return ok({
        user, summary: summary(pf),
        by_type: group((a) => nameOf('activity_types', a.activity_type_id)),
        by_outcome: group((a) => nameOf('activity_outcomes', a.outcome_id)),
        filters: f,
      });
    },
  },

  search: {
    query: (q) => {
      load();
      const raw = String(q || '').trim();
      if (raw.length < 2) return ok({ query: raw, leads: [], tasks: [], users: [] });
      const sc = scope();
      const lower = raw.toLowerCase();
      const phone = normalizePhone(raw);

      const leads = state.leads.map(enrichLead)
        .filter((l) => !Array.isArray(sc) || sc.includes(l.owner_id))
        .filter((l) => {
          const hay = [l.business_name, l.contact_name, l.email, l.website, l.city, l.state, l.notes, l.phone]
            .filter(Boolean).join(' ').toLowerCase();
          return hay.includes(lower) || (phone && l.normalized_phone?.includes(phone));
        })
        .slice(0, 8);

      const tasks = state.tasks.map(enrichTask)
        .filter((t) => !Array.isArray(sc) || sc.includes(t.assigned_to))
        .filter((t) => `${t.title} ${t.description ?? ''}`.toLowerCase().includes(lower))
        .slice(0, 8);

      const users = state.users.filter((u) => u.active && `${u.name} ${u.email}`.toLowerCase().includes(lower)).slice(0, 8);

      return ok({ query: raw, normalized_phone: phone, leads, tasks, users });
    },

    duplicates: ({ phone, email } = {}) => {
      const p = normalizePhone(phone);
      const e = String(email || '').trim().toLowerCase();
      if (!p && !e) return ok({ matches: [] });
      const matches = state.leads.map(enrichLead)
        .filter((l) => (p && l.normalized_phone === p) || (e && l.email?.toLowerCase() === e))
        .slice(0, 10);
      return ok({ matches });
    },
  },

  importCsv: {
    analyze: (csv) => {
      const rows = parseCsv(String(csv || ''));
      if (rows.length < 2) fail(400, 'The file needs a header row and at least one data row');
      const headers = rows[0].map((h) => String(h).trim());
      return ok({
        headers,
        suggested_mapping: guessMapping(headers),
        importable_fields: IMPORTABLE_FIELDS,
        total_rows: rows.length - 1,
        preview: rows.slice(1, 11),
      });
    },

    commit: ({ csv, mapping, owner_id, source_id, skip_duplicates }) => {
      if (!canSeeTeam(actingUser())) fail(403, 'Only an admin or manager can import');
      const fields = Object.values(mapping || {});
      if (!fields.includes('business_name')) fail(400, 'business_name must be mapped');

      const rows = parseCsv(String(csv || '')).slice(1);
      const skip = String(skip_duplicates ?? 'true') !== 'false';
      const defStatus = state.statuses.find((s) => s.is_default) ?? state.statuses[0];
      const defPriority = state.priorities.find((p) => p.is_default);
      const csvSource = source_id ? Number(source_id) : state.lead_sources.find((s) => s.name === 'CSV Import')?.id ?? null;

      const result = { imported: 0, duplicates: 0, invalid: 0, skipped: 0, errors: [], imported_ids: [], total_rows: rows.length };
      const seenP = new Set();
      const seenE = new Set();

      rows.forEach((cells, idx) => {
        const line = idx + 2;
        const rec = {};
        for (const [i, field] of Object.entries(mapping)) {
          if (!field) continue;
          const v = cells[Number(i)];
          if (v != null && String(v).trim() !== '') rec[field] = String(v).trim();
        }
        if (!rec.business_name) {
          result.invalid++;
          result.errors.push({ line, reason: 'Missing business name' });
          return;
        }
        const phone = normalizePhone(rec.phone);
        const mail = rec.email ? rec.email.toLowerCase() : null;
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
          result.invalid++;
          result.errors.push({ line, reason: `Invalid email: ${rec.email}`, business: rec.business_name });
          return;
        }
        const dupP = phone && (seenP.has(phone) || state.leads.some((l) => l.normalized_phone === phone));
        const dupE = mail && (seenE.has(mail) || state.leads.some((l) => l.email?.toLowerCase() === mail));
        if (dupP || dupE) {
          result.duplicates++;
          if (skip) {
            result.errors.push({ line, reason: dupP ? 'Duplicate phone' : 'Duplicate email', business: rec.business_name });
            return;
          }
        }

        let rowSource = csvSource;
        if (rec.source) {
          const f = state.lead_sources.find((s) => s.name.toLowerCase() === rec.source.toLowerCase());
          if (f) rowSource = f.id;
        }
        const value = rec.estimated_value != null ? Number(String(rec.estimated_value).replace(/[^\d.]/g, '')) : null;

        const lead = {
          id: nextId('leads'),
          business_name: rec.business_name.slice(0, 200),
          contact_name: rec.contact_name ?? null,
          phone: rec.phone ?? null,
          normalized_phone: phone,
          email: mail,
          website: rec.website ?? null,
          address: rec.address ?? null,
          city: rec.city ?? null,
          state: rec.state ?? null,
          country: rec.country ?? null,
          industry: rec.industry ?? null,
          niche: rec.niche ?? null,
          notes: rec.notes ?? null,
          estimated_value: Number.isFinite(value) ? value : null,
          source_id: rowSource,
          status_id: defStatus.id,
          priority_id: defPriority?.id ?? null,
          owner_id: owner_id ? Number(owner_id) : null,
          created_at: nowStamp(),
          updated_at: nowStamp(),
          last_activity_at: null,
          next_follow_up_at: null,
        };
        state.leads.push(lead);
        logEvent(lead.id, 'imported', null, lead.business_name);
        if (phone) seenP.add(phone);
        if (mail) seenE.add(mail);
        result.imported++;
        result.imported_ids.push(lead.id);
      });

      result.skipped = result.invalid + (skip ? result.duplicates : 0);
      save();
      return ok(result);
    },
  },
};

export default demoApi;
