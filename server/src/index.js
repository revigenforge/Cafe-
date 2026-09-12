import express from 'express';
import cors from 'cors';
import { migrate } from './db/migrate.js';
import { currentUser } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';

import usersRoutes from './routes/users.js';
import leadsRoutes from './routes/leads.js';
import activitiesRoutes from './routes/activities.js';
import tasksRoutes from './routes/tasks.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import analyticsRoutes from './routes/analytics.js';
import importRoutes from './routes/import.js';
import searchRoutes from './routes/search.js';

const PORT = Number(process.env.PORT) || 4000;

migrate({ quiet: true });

const app = express();

app.use(cors({ origin: true, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/* Unauthenticated: the login screen needs the roster before anyone has
   chosen who they are. Returns names and roles only. */
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/session/users', (req, res, next) => {
  try {
    import('./db/index.js').then(({ default: db }) => {
      res.json(
        db.prepare('SELECT id, name, email, role FROM users WHERE active = 1 ORDER BY role, name').all()
      );
    }).catch(next);
  } catch (err) {
    next(err);
  }
});

/* Everything below needs an acting user. */
app.use('/api', currentUser);

app.use('/api/users', usersRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/search', searchRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`CRM API listening on http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}

export default app;
