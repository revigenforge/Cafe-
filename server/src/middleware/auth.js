import db from '../db/index.js';
import { ApiError, forbidden } from './errors.js';

/**
 * ═══════════════════════════════════════════════════════════════
 *  Identity and permissions.
 *
 *  Identity is deliberately thin for v1: the client sends the acting
 *  user's id in `x-user-id`. That is NOT authentication — anyone who
 *  can reach the API can claim to be anyone. It is a development
 *  stand-in so multiple team members can be tested.
 *
 *  Everything downstream reads `req.user`, so swapping this one
 *  function for a session or JWT lookup later changes nothing else
 *  in the codebase. Permission rules below are already enforced
 *  server-side and stay valid once real auth arrives.
 * ═══════════════════════════════════════════════════════════════
 */

export const ROLES = ['ADMIN', 'MANAGER', 'SALESPERSON'];

export function currentUser(req, res, next) {
  const raw = req.get('x-user-id');
  if (!raw) {
    return next(new ApiError(401, 'No acting user. Send an x-user-id header.'));
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    return next(new ApiError(401, 'x-user-id must be a user id'));
  }
  const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(id);
  if (!user) return next(new ApiError(401, 'That user does not exist'));
  if (!user.active) return next(new ApiError(403, 'That user account is deactivated'));

  req.user = user;
  next();
}

export const isAdmin = (u) => u.role === 'ADMIN';
export const isManager = (u) => u.role === 'MANAGER';
/** Admins and managers both see across the team; salespeople do not. */
export const canSeeTeam = (u) => u.role === 'ADMIN' || u.role === 'MANAGER';
export const canAssign = (u) => u.role === 'ADMIN' || u.role === 'MANAGER';
export const canManageSettings = (u) => u.role === 'ADMIN';

/** Route guard: `requireRole('ADMIN')` or `requireRole('ADMIN','MANAGER')`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not signed in'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action needs the ${roles.join(' or ')} role`));
    }
    next();
  };
}

/**
 * The owner ids a user may see. `null` means "no restriction".
 * Salespeople are limited to themselves; everyone else sees the team.
 *
 * Every list endpoint runs through this, so a salesperson cannot read
 * another rep's leads by guessing query parameters.
 */
export function visibleOwnerIds(user) {
  if (canSeeTeam(user)) return null;
  return [user.id];
}

/** Throws unless the user may act on a lead owned by `ownerId`. */
export function assertLeadAccess(user, ownerId) {
  if (canSeeTeam(user)) return;
  if (ownerId === user.id) return;
  throw forbidden('That lead is not assigned to you');
}
