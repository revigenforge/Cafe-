import { badRequest } from './errors.js';

/**
 * Small hand-rolled validators. No schema library — the surface is
 * narrow enough that explicit checks are clearer than a DSL, and
 * every one of them is the last line of defence before SQL.
 */

export function str(value, field, { required = false, max = 2000, trim = true } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  const v = trim ? value.trim() : value;
  if (required && !v) throw badRequest(`${field} is required`);
  if (v.length > max) throw badRequest(`${field} must be ${max} characters or fewer`);
  return v || null;
}

export function int(value, field, { required = false, min = null, max = null } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${field} must be a whole number`);
  if (min != null && n < min) throw badRequest(`${field} must be at least ${min}`);
  if (max != null && n > max) throw badRequest(`${field} must be at most ${max}`);
  return n;
}

export function num(value, field, { required = false, min = null } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  if (min != null && n < min) throw badRequest(`${field} must be at least ${min}`);
  return n;
}

export function bool(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === '1' || value === 'true') return 1;
  if (value === 0 || value === '0' || value === 'false') return 0;
  throw badRequest(`${field} must be true or false`);
}

export function oneOf(value, field, allowed, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/;

/** Accepts YYYY-MM-DD or an ISO timestamp; stores the date part. */
export function dateStr(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const v = String(value).trim();
  if (!DATE_ONLY.test(v) && !DATE_TIME.test(v)) {
    throw badRequest(`${field} must be a date like 2026-03-14`);
  }
  if (Number.isNaN(new Date(v).getTime())) throw badRequest(`${field} is not a real date`);
  return v.slice(0, 10);
}

export function email(value, field, { required = false } = {}) {
  const v = str(value, field, { required, max: 320 });
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest(`${field} must be a valid email`);
  return v ? v.toLowerCase() : null;
}

/**
 * Confirms a foreign key points at a row that exists.
 * Every id arriving from a client goes through here before it is stored.
 */
export function refId(db, table, value, field, { required = false } = {}) {
  const id = int(value, field, { required, min: 1 });
  if (id == null) return null;
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw badRequest(`${field} does not refer to an existing record`);
  return id;
}

/** Parses `ids` as an array of positive integers, for bulk endpoints. */
export function idList(value, field, { max = 1000 } = {}) {
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list of ids`);
  if (value.length === 0) throw badRequest(`${field} cannot be empty`);
  if (value.length > max) throw badRequest(`${field} cannot contain more than ${max} ids`);
  return value.map((v, i) => int(v, `${field}[${i}]`, { required: true, min: 1 }));
}
