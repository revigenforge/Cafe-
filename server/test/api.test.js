/**
 * End-to-end API tests. These hit a running server on PORT (default
 * 4000) with the seeded demo database, so they exercise real SQL,
 * real permissions and real validation rather than mocks.
 *
 *   npm run db:seed && npm start &   # then
 *   npm test
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.CRM_API || 'http://localhost:4000';

const ADMIN = 1;
const MANAGER = 2;
const SALES_A = 3;
const SALES_B = 4;

async function api(path, { as = ADMIN, method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-user-id': String(as),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

describe('health and session', () => {
  test('health responds', async () => {
    const r = await api('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });

  test('session user list needs no auth', async () => {
    const res = await fetch(`${BASE}/api/session/users`);
    assert.equal(res.status, 200);
    const users = await res.json();
    assert.ok(users.length >= 5);
  });

  test('API rejects a missing user header', async () => {
    const res = await fetch(`${BASE}/api/leads`);
    assert.equal(res.status, 401);
  });

  test('API rejects an unknown user', async () => {
    const r = await api('/api/leads', { as: 99999 });
    assert.equal(r.status, 401);
  });
});

describe('settings', () => {
  test('bootstrap returns every lookup the UI needs', async () => {
    const r = await api('/api/settings/bootstrap');
    assert.equal(r.status, 200);
    for (const k of ['statuses', 'lead_sources', 'priorities', 'activity_types', 'activity_outcomes', 'funnel_stages']) {
      assert.ok(Array.isArray(r.body[k]) && r.body[k].length > 0, `${k} should be populated`);
    }
    assert.equal(r.body.current_user.id, ADMIN);
  });

  test('a salesperson cannot create a status', async () => {
    const r = await api('/api/settings/statuses', { as: SALES_A, method: 'POST', body: { name: 'Nope' } });
    assert.equal(r.status, 403);
  });

  test('admin can create, rename and delete a status', async () => {
    const created = await api('/api/settings/statuses', {
      method: 'POST', body: { name: 'Test Stage', color: 'teal', funnel_stage: 'CONTACTED' },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const renamed = await api(`/api/settings/statuses/${id}`, { method: 'PATCH', body: { name: 'Test Stage 2' } });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'Test Stage 2');

    const gone = await api(`/api/settings/statuses/${id}`, { method: 'DELETE' });
    assert.equal(gone.status, 200);
  });

  test('the default status cannot be deleted', async () => {
    const list = await api('/api/settings/statuses');
    const def = list.body.find((s) => s.is_default);
    const r = await api(`/api/settings/statuses/${def.id}`, { method: 'DELETE' });
    assert.equal(r.status, 400);
  });

  test('a status still in use cannot be deleted', async () => {
    const list = await api('/api/settings/statuses');
    const inUse = list.body.find((s) => s.name === 'Contacted');
    const r = await api(`/api/settings/statuses/${inUse.id}`, { method: 'DELETE' });
    assert.equal(r.status, 409);
  });
});

describe('leads', () => {
  test('admin sees more leads than one salesperson', async () => {
    const all = await api('/api/leads?per_page=200');
    const mine = await api('/api/leads?per_page=200', { as: SALES_A });
    assert.equal(all.status, 200);
    assert.ok(all.body.total > mine.body.total, 'admin should see the whole book');
    assert.ok(mine.body.data.every((l) => l.owner_id === SALES_A), 'salesperson sees only their own');
  });

  test('a salesperson cannot widen scope with a query parameter', async () => {
    const r = await api(`/api/leads?owner_id=${SALES_B}&per_page=200`, { as: SALES_A });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 0, 'asking for another rep returns nothing, not their leads');
  });

  test('filters combine with AND', async () => {
    const statuses = (await api('/api/settings/statuses')).body;
    const contacted = statuses.find((s) => s.name === 'Contacted');
    const both = await api(`/api/leads?status_id=${contacted.id}&state=Karnataka&per_page=200`);
    assert.equal(both.status, 200);
    assert.ok(both.body.data.every((l) => l.status_id === contacted.id && l.state === 'Karnataka'));
  });

  test('search matches a business name', async () => {
    const r = await api('/api/leads?search=Iron Forge');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.some((l) => l.business_name.includes('Iron Forge')));
  });

  test('sorting is limited to known columns', async () => {
    const r = await api('/api/leads?sort=business_name&dir=asc&per_page=5');
    assert.equal(r.status, 200);
    const names = r.body.data.map((l) => l.business_name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  test('an injection attempt in sort is ignored, not executed', async () => {
    const r = await api('/api/leads?sort=business_name;DROP TABLE leads--&per_page=5');
    assert.equal(r.status, 200);
    const still = await api('/api/leads?per_page=1');
    assert.ok(still.body.total > 0, 'leads table survived');
  });

  test('create, read, update and delete a lead', async () => {
    const created = await api('/api/leads', {
      method: 'POST',
      body: { business_name: 'Test Co', phone: '+91 98765 43210', city: 'Pune', owner_id: SALES_A },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal(created.body.normalized_phone, '9876543210', 'phone is normalised on write');

    const read = await api(`/api/leads/${id}`);
    assert.equal(read.status, 200);
    assert.ok(Array.isArray(read.body.activities));

    const patched = await api(`/api/leads/${id}`, { method: 'PATCH', body: { city: 'Mumbai' } });
    assert.equal(patched.body.city, 'Mumbai');

    const del = await api(`/api/leads/${id}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.equal((await api(`/api/leads/${id}`)).status, 404);
  });

  test('a salesperson cannot delete a lead', async () => {
    const mine = await api('/api/leads?per_page=1', { as: SALES_A });
    const id = mine.body.data[0].id;
    const r = await api(`/api/leads/${id}`, { as: SALES_A, method: 'DELETE' });
    assert.equal(r.status, 403);
  });

  test('a salesperson cannot read a lead owned by someone else', async () => {
    const others = await api(`/api/leads?owner_id=${SALES_B}&per_page=1`);
    const id = others.body.data[0].id;
    const r = await api(`/api/leads/${id}`, { as: SALES_A });
    assert.equal(r.status, 403);
  });

  test('invalid foreign keys are rejected', async () => {
    const r = await api('/api/leads', { method: 'POST', body: { business_name: 'X', status_id: 99999 } });
    assert.equal(r.status, 400);
  });

  test('a lead needs a business name', async () => {
    const r = await api('/api/leads', { method: 'POST', body: { city: 'Pune' } });
    assert.equal(r.status, 400);
  });

  test('bulk assign moves several leads and records events', async () => {
    const list = await api('/api/leads?per_page=3');
    const ids = list.body.data.map((l) => l.id);
    const r = await api('/api/leads/bulk/assign', { method: 'POST', body: { ids, owner_id: SALES_B } });
    assert.equal(r.status, 200);
    assert.equal(r.body.updated, ids.length);

    const check = await api(`/api/leads/${ids[0]}`);
    assert.equal(check.body.owner_id, SALES_B);
    assert.ok(check.body.events.some((e) => e.event_type === 'assigned'));
  });

  test('a salesperson cannot bulk assign', async () => {
    const list = await api('/api/leads?per_page=2', { as: SALES_A });
    const ids = list.body.data.map((l) => l.id);
    const r = await api('/api/leads/bulk/assign', { as: SALES_A, method: 'POST', body: { ids, owner_id: SALES_A } });
    assert.equal(r.status, 403);
  });

  test('bulk status change is applied', async () => {
    const statuses = (await api('/api/settings/statuses')).body;
    const target = statuses.find((s) => s.name === 'Interested');
    const list = await api('/api/leads?per_page=2');
    const ids = list.body.data.map((l) => l.id);
    const r = await api('/api/leads/bulk/status', { method: 'POST', body: { ids, status_id: target.id } });
    assert.equal(r.status, 200);
    const check = await api(`/api/leads/${ids[0]}`);
    assert.equal(check.body.status_id, target.id);
  });

  test('CSV export returns a file', async () => {
    const res = await api('/api/leads/export?per_page=10', { raw: true });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const text = await res.text();
    assert.match(text.split('\n')[0], /business_name/);
  });

  test('facets return filter options', async () => {
    const r = await api('/api/leads/facets');
    assert.equal(r.status, 200);
    assert.ok(r.body.cities.length > 0);
    assert.ok(r.body.industries.length > 0);
  });
});

describe('activities', () => {
  let leadId;
  before(async () => {
    const list = await api(`/api/leads?owner_id=${SALES_A}&per_page=1`);
    leadId = list.body.data[0].id;
  });

  test('logging an activity moves the lead clock forward', async () => {
    const boot = (await api('/api/settings/bootstrap')).body;
    const call = boot.activity_types.find((t) => t.name === 'Call');
    const connected = boot.activity_outcomes.find((o) => o.name === 'Connected');

    const before = await api(`/api/leads/${leadId}`);
    const r = await api('/api/activities', {
      as: SALES_A,
      method: 'POST',
      body: {
        lead_id: leadId, activity_type_id: call.id, outcome_id: connected.id,
        notes: 'test call', follow_up_date: '2026-12-01',
      },
    });
    assert.equal(r.status, 201);

    const after = await api(`/api/leads/${leadId}`);
    assert.notEqual(after.body.last_activity_at, before.body.last_activity_at);
    assert.equal(after.body.next_follow_up_at, '2026-12-01');
    assert.ok(after.body.activities.length > before.body.activities.length);
  });

  test('an activity can move the status in the same request', async () => {
    const boot = (await api('/api/settings/bootstrap')).body;
    const call = boot.activity_types.find((t) => t.name === 'Call');
    const target = boot.statuses.find((s) => s.name === 'Meeting Booked');

    await api('/api/activities', {
      as: SALES_A, method: 'POST',
      body: { lead_id: leadId, activity_type_id: call.id, status_id: target.id, notes: 'booked a meeting' },
    });

    const after = await api(`/api/leads/${leadId}`);
    assert.equal(after.body.status_id, target.id);
    assert.ok(after.body.events.some((e) => e.event_type === 'status_changed'));
  });

  test('a salesperson cannot log against a lead that is not theirs', async () => {
    const boot = (await api('/api/settings/bootstrap')).body;
    const call = boot.activity_types.find((t) => t.name === 'Call');
    const others = await api(`/api/leads?owner_id=${SALES_B}&per_page=1`);
    const r = await api('/api/activities', {
      as: SALES_A, method: 'POST',
      body: { lead_id: others.body.data[0].id, activity_type_id: call.id },
    });
    assert.equal(r.status, 403);
  });

  test('the team feed merges activities, field changes and completed tasks', async () => {
    const r = await api('/api/activities/feed?limit=40');
    assert.equal(r.status, 200);
    const kinds = new Set(r.body.data.map((x) => x.kind));
    assert.ok(kinds.has('activity'), 'feed includes activities');
    assert.ok(kinds.size > 1, 'feed is not only activities');
  });

  test('a salesperson feed shows only their own work', async () => {
    const r = await api('/api/activities?per_page=200', { as: SALES_A });
    assert.ok(r.body.data.every((a) => a.user_id === SALES_A));
  });
});

describe('tasks', () => {
  test('task counts and lists agree', async () => {
    const counts = await api('/api/tasks/counts?scope=mine', { as: SALES_A });
    const overdue = await api('/api/tasks?view=overdue&per_page=200', { as: SALES_A });
    assert.equal(counts.status, 200);
    assert.equal(counts.body.overdue, overdue.body.total, 'count matches the list it labels');
  });

  test('completing a task stamps completed_at, reopening clears it', async () => {
    const created = await api('/api/tasks', {
      as: SALES_A, method: 'POST',
      body: { title: 'Test task', priority: 'High', due_date: '2026-12-31' },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const done = await api(`/api/tasks/${id}`, { as: SALES_A, method: 'PATCH', body: { status: 'Completed' } });
    assert.ok(done.body.completed_at, 'completed_at is set');

    const reopened = await api(`/api/tasks/${id}`, { as: SALES_A, method: 'PATCH', body: { status: 'To Do' } });
    assert.equal(reopened.body.completed_at, null, 'completed_at is cleared');

    await api(`/api/tasks/${id}`, { as: SALES_A, method: 'DELETE' });
  });

  test('a salesperson cannot assign a task to someone else', async () => {
    const r = await api('/api/tasks', {
      as: SALES_A, method: 'POST', body: { title: 'Sneaky', assigned_to: SALES_B },
    });
    assert.equal(r.status, 403);
  });

  test('a manager can assign a task to a salesperson', async () => {
    const r = await api('/api/tasks', {
      as: MANAGER, method: 'POST', body: { title: 'Manager task', assigned_to: SALES_A },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.assigned_to, SALES_A);
    await api(`/api/tasks/${r.body.id}`, { method: 'DELETE' });
  });

  test('an invalid task status is rejected', async () => {
    const r = await api('/api/tasks', { method: 'POST', body: { title: 'X', status: 'Nonsense' } });
    assert.equal(r.status, 400);
  });
});

describe('dashboard and queue', () => {
  test('salesperson dashboard has no team block', async () => {
    const r = await api('/api/dashboard', { as: SALES_A });
    assert.equal(r.status, 200);
    assert.ok(r.body.mine.summary);
    assert.equal(r.body.team, undefined, 'a salesperson does not get team figures');
  });

  test('manager dashboard includes the team comparison', async () => {
    const r = await api('/api/dashboard', { as: MANAGER });
    assert.ok(r.body.team);
    assert.ok(r.body.team.by_person.length >= 3);
  });

  test('the queue returns a reason for every lead it surfaces', async () => {
    const r = await api('/api/dashboard/queue', { as: SALES_A });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.every((l) => typeof l.queue_reason === 'string' && l.queue_reason.length > 0));
  });

  test('the queue never contains a won or lost lead', async () => {
    const r = await api('/api/dashboard/queue?limit=200', { as: MANAGER });
    assert.ok(r.body.data.every((l) => !l.status_is_won && !l.status_is_lost));
  });
});

describe('analytics', () => {
  test('summary and dashboard report the same numbers', async () => {
    const dash = await api('/api/dashboard', { as: SALES_A });
    const an = await api('/api/analytics/summary', { as: SALES_A });
    assert.equal(an.status, 200);
    assert.equal(
      dash.body.mine.summary.total_leads,
      an.body.total_leads,
      'one metric definition means one number'
    );
    assert.equal(dash.body.mine.summary.conversion_rate, an.body.conversion_rate);
  });

  test('the funnel never widens as it descends', async () => {
    const r = await api('/api/analytics/funnel');
    assert.equal(r.status, 200);
    const counts = r.body.stages.map((s) => s.count);
    for (let i = 1; i < counts.length; i++) {
      assert.ok(counts[i] <= counts[i - 1], `stage ${i} (${counts[i]}) must not exceed stage ${i - 1} (${counts[i - 1]})`);
    }
  });

  test('performance is admin and manager only', async () => {
    assert.equal((await api('/api/analytics/performance', { as: SALES_A })).status, 403);
    assert.equal((await api('/api/analytics/performance', { as: MANAGER })).status, 200);
  });

  test('a salesperson can read their own performance but not a colleague\'s', async () => {
    assert.equal((await api(`/api/analytics/performance/${SALES_A}`, { as: SALES_A })).status, 200);
    assert.equal((await api(`/api/analytics/performance/${SALES_B}`, { as: SALES_A })).status, 403);
  });

  test('per-person leads sum to the team total', async () => {
    const perf = await api('/api/analytics/performance', { as: ADMIN });
    const summed = perf.body.data.reduce((n, r) => n + r.leads_assigned, 0);
    const all = await api('/api/leads?per_page=1');
    const unassigned = await api('/api/leads?owner_id=unassigned&per_page=1');
    assert.equal(summed + unassigned.body.total, all.body.total, 'every lead is counted once');
  });

  test('breakdown groups leads without losing any', async () => {
    const r = await api('/api/analytics/breakdown?field=state');
    const summed = r.body.data.reduce((n, x) => n + x.count, 0);
    const all = await api('/api/leads?per_page=1');
    assert.equal(summed, all.body.total);
  });
});

describe('search', () => {
  test('a phone number typed any way finds the same lead', async () => {
    const list = await api('/api/leads?has_phone=true&per_page=1');
    const lead = list.body.data[0];
    const raw = lead.normalized_phone;

    for (const variant of [raw, `+91${raw}`, `0${raw}`, `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`]) {
      const r = await api(`/api/search?q=${encodeURIComponent(variant)}`);
      assert.ok(r.body.leads.some((l) => l.id === lead.id), `"${variant}" should find lead ${lead.id}`);
    }
  });

  test('duplicate check finds an existing number', async () => {
    const list = await api('/api/leads?has_phone=true&per_page=1');
    const lead = list.body.data[0];
    const r = await api(`/api/search/duplicates?phone=%2B91${lead.normalized_phone}`);
    assert.ok(r.body.matches.some((m) => m.id === lead.id));
  });

  test('a short query returns nothing rather than everything', async () => {
    const r = await api('/api/search?q=a');
    assert.equal(r.body.leads.length, 0);
  });
});

describe('csv import', () => {
  const CSV = [
    'Company,Contact Person,Mobile,Email,City,State,Business Type',
    'Alpha Gym,Ramesh K,+91 90000 00001,alpha@test.in,Pune,Maharashtra,Gym',
    'Beta Cafe,Sita R,090000 00002,beta@test.in,Mumbai,Maharashtra,Cafe',
    'Gamma Salon,Nita P,9000000003,,Delhi,Delhi,Salon',
    ',No Name,9000000004,,Pune,Maharashtra,Gym',
    'Delta Store,Raj M,9000000005,not-an-email,Pune,Maharashtra,Retail',
    'Alpha Gym Again,Ramesh K,+919000000001,dup@test.in,Pune,Maharashtra,Gym',
  ].join('\n');

  test('analyze guesses the column mapping without writing anything', async () => {
    const before = (await api('/api/leads?per_page=1')).body.total;
    const r = await api('/api/import/analyze', { method: 'POST', body: { csv: CSV } });
    assert.equal(r.status, 200);
    assert.equal(r.body.total_rows, 6);
    const mapped = Object.values(r.body.suggested_mapping);
    assert.ok(mapped.includes('business_name'));
    assert.ok(mapped.includes('phone'));
    assert.ok(mapped.includes('email'));
    assert.ok(mapped.includes('city'));
    const after = (await api('/api/leads?per_page=1')).body.total;
    assert.equal(before, after, 'analyze must not import');
  });

  test('commit imports valid rows and classifies the rest', async () => {
    const analyzed = await api('/api/import/analyze', { method: 'POST', body: { csv: CSV } });
    const r = await api('/api/import/commit', {
      method: 'POST',
      body: { csv: CSV, mapping: analyzed.body.suggested_mapping, owner_id: SALES_A },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.imported, 3, 'three clean rows');
    assert.equal(r.body.invalid, 2, 'one missing name, one bad email');
    assert.equal(r.body.duplicates, 1, 'the repeated phone, in a different format');

    // clean up
    for (const id of r.body.imported_ids) await api(`/api/leads/${id}`, { method: 'DELETE' });
  });

  test('commit refuses a mapping without a business name', async () => {
    const r = await api('/api/import/commit', { method: 'POST', body: { csv: CSV, mapping: { 1: 'phone' } } });
    assert.equal(r.status, 400);
  });

  test('a salesperson cannot import', async () => {
    const r = await api('/api/import/analyze', { as: SALES_A, method: 'POST', body: { csv: CSV } });
    assert.equal(r.status, 403);
  });
});

describe('users', () => {
  test('the last admin cannot be demoted', async () => {
    const r = await api(`/api/users/${ADMIN}`, { method: 'PATCH', body: { role: 'SALESPERSON' } });
    assert.equal(r.status, 400);
  });

  test('the last admin cannot be deactivated', async () => {
    const r = await api(`/api/users/${ADMIN}`, { method: 'DELETE' });
    assert.equal(r.status, 400);
  });

  test('a salesperson cannot create a user', async () => {
    const r = await api('/api/users', {
      as: SALES_A, method: 'POST', body: { name: 'X', email: 'x@test.in', role: 'ADMIN' },
    });
    assert.equal(r.status, 403);
  });

  test('duplicate emails are refused', async () => {
    const r = await api('/api/users', {
      method: 'POST', body: { name: 'Clash', email: 'aditya@revigenforge.test', role: 'SALESPERSON' },
    });
    assert.equal(r.status, 400);
  });
});
