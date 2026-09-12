/**
 * The only place that talks to the API.
 *
 * The acting user id rides along in a header. When real authentication
 * arrives, this header is replaced by a session cookie or bearer token
 * and nothing else in the client changes.
 */

import { demoApi } from '../demo/engine.js';

const USER_KEY = 'crm.user_id';

export const getActingUserId = () => {
  const v = localStorage.getItem(USER_KEY);
  return v ? Number(v) : null;
};

export const setActingUserId = (id) => {
  if (id == null) localStorage.removeItem(USER_KEY);
  else localStorage.setItem(USER_KEY, String(id));
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const userId = getActingUserId();

  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(userId ? { 'x-user-id': String(userId) } : {}),
      ...(body instanceof FormData ? {} : body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });

  if (raw) return res;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  }
  return data;
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) sp.set(k, v.join(','));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

const realApi = {
  qs,
  raw: request,

  health: () => request('/health'),
  sessionUsers: () => request('/session/users'),
  bootstrap: () => request('/settings/bootstrap'),

  users: {
    list: (p) => request(`/users${qs(p)}`),
    create: (body) => request('/users', { method: 'POST', body }),
    update: (id, body) => request(`/users/${id}`, { method: 'PATCH', body }),
    deactivate: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  },

  settings: {
    list: (collection) => request(`/settings/${collection}`),
    create: (collection, body) => request(`/settings/${collection}`, { method: 'POST', body }),
    update: (collection, id, body) => request(`/settings/${collection}/${id}`, { method: 'PATCH', body }),
    remove: (collection, id) => request(`/settings/${collection}/${id}`, { method: 'DELETE' }),
  },

  leads: {
    list: (p) => request(`/leads${qs(p)}`),
    facets: () => request('/leads/facets'),
    get: (id) => request(`/leads/${id}`),
    create: (body) => request('/leads', { method: 'POST', body }),
    update: (id, body) => request(`/leads/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/leads/${id}`, { method: 'DELETE' }),
    bulkAssign: (ids, owner_id) => request('/leads/bulk/assign', { method: 'POST', body: { ids, owner_id } }),
    bulkStatus: (ids, status_id) => request('/leads/bulk/status', { method: 'POST', body: { ids, status_id } }),
    bulkPriority: (ids, priority_id) => request('/leads/bulk/priority', { method: 'POST', body: { ids, priority_id } }),
    bulkDelete: (ids) => request('/leads/bulk/delete', { method: 'POST', body: { ids } }),
    phones: (ids) => request('/leads/bulk/phones', { method: 'POST', body: { ids } }),
    exportUrl: (p) => `/api/leads/export${qs(p)}`,
  },

  activities: {
    list: (p) => request(`/activities${qs(p)}`),
    feed: (p) => request(`/activities/feed${qs(p)}`),
    create: (body) => request('/activities', { method: 'POST', body }),
    update: (id, body) => request(`/activities/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/activities/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (p) => request(`/tasks${qs(p)}`),
    counts: (p) => request(`/tasks/counts${qs(p)}`),
    create: (body) => request('/tasks', { method: 'POST', body }),
    update: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body }),
    remove: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
    bulkStatus: (ids, status) => request('/tasks/bulk/status', { method: 'POST', body: { ids, status } }),
  },

  dashboard: {
    get: () => request('/dashboard'),
    queue: (p) => request(`/dashboard/queue${qs(p)}`),
  },

  analytics: {
    summary: (p) => request(`/analytics/summary${qs(p)}`),
    funnel: (p) => request(`/analytics/funnel${qs(p)}`),
    byStatus: (p) => request(`/analytics/by-status${qs(p)}`),
    breakdown: (p) => request(`/analytics/breakdown${qs(p)}`),
    trend: (p) => request(`/analytics/activity-trend${qs(p)}`),
    performance: (p) => request(`/analytics/performance${qs(p)}`),
    person: (id, p) => request(`/analytics/performance/${id}${qs(p)}`),
  },

  search: {
    query: (q) => request(`/search${qs({ q })}`),
    duplicates: (p) => request(`/search/duplicates${qs(p)}`),
  },

  importCsv: {
    analyze: (csv) => request('/import/analyze', { method: 'POST', body: { csv } }),
    commit: (payload) => request('/import/commit', { method: 'POST', body: payload }),
  },
};

/**
 * The demo build swaps the whole transport for an in-browser store so
 * the app can be published as a single page with no server. Behaviour
 * is identical from every component's point of view — nothing above
 * this line, and nothing in any page, knows which one it got.
 *
 * Off by default: a normal build talks to the real API.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

export const api = IS_DEMO ? demoApi : realApi;

export default api;
