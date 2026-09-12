/** A failure the client caused and should be told about plainly. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const forbidden = (msg = 'You do not have access to do that') => new ApiError(403, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const conflict = (msg, details) => new ApiError(409, msg, details);

/** Wraps an async route so a rejected promise reaches the error handler. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }

  /* Translate SQLite's internal messages into something a user can act
     on, without leaking table or column names. */
  const code = err.code || '';
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ error: 'That referenced record does not exist' });
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return res.status(409).json({ error: 'That value is already taken' });
  }
  if (code === 'SQLITE_CONSTRAINT_CHECK') {
    return res.status(400).json({ error: 'That value is not one of the allowed options' });
  }
  if (code.startsWith('SQLITE_')) {
    console.error('[db]', err.message);
    return res.status(500).json({ error: 'The database rejected that request' });
  }

  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
