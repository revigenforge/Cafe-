import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import api from './api/client.js';
import { ErrorBox, Loading, initials } from './components/ui.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyWork from './pages/MyWork.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Queue from './pages/Queue.jsx';
import Tasks from './pages/Tasks.jsx';
import TeamActivity from './pages/TeamActivity.jsx';
import Analytics from './pages/Analytics.jsx';
import Performance from './pages/Performance.jsx';
import ImportLeads from './pages/ImportLeads.jsx';
import Settings from './pages/Settings.jsx';

const Icon = ({ d }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7V12h-7v9zm0-18v7h7V3h-7z',
  work: 'M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 5h4v2h-4V5z',
  queue: 'M4 6h16M4 12h16M4 18h10',
  leads: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  pipeline: 'M3 3v18h18M7 16V9m5 7V5m5 11v-4',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  team: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  analytics: 'M18 20V10M12 20V4M6 20v-6',
  performance: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.6-6.2 4.6 2.4-7.4L2 9.4h7.6z',
  import: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9v.09a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};

function Sidebar({ counts, open, onClose }) {
  const { user, canSeeTeam, isAdmin, isManager, signOut } = useApp();

  const link = (to, label, icon, count, alert = false) => (
    <NavLink to={to} className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`} onClick={onClose} end={to === '/'}>
      <Icon d={ICONS[icon]} />
      <span>{label}</span>
      {count > 0 && <span className={`count ${alert ? 'is-alert' : ''}`}>{count > 99 ? '99+' : count}</span>}
    </NavLink>
  );

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar__brand">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17l5-7 5 4 6-9" />
        </svg>
        Sales CRM
      </div>

      <nav className="sidebar__nav">
        {link('/', 'Dashboard', 'dashboard')}
        {link('/my-work', 'My Work', 'work', counts.myOpenTasks)}
        {link('/queue', 'Sales Queue', 'queue', counts.queue, counts.overdueFollowUps > 0)}

        <div className="sidebar__section">Pipeline</div>
        {link('/leads', 'Leads', 'leads')}
        {link('/pipeline', 'Board', 'pipeline')}
        {link('/tasks', 'Tasks', 'tasks', counts.overdueTasks, true)}

        {canSeeTeam && (
          <>
            <div className="sidebar__section">Team</div>
            {link('/team', 'Team Activity', 'team')}
            {link('/analytics', 'Analytics', 'analytics')}
            {link('/performance', 'Performance', 'performance')}
          </>
        )}

        <div className="sidebar__section">Data</div>
        {(isAdmin || isManager) && link('/import', 'Import CSV', 'import')}
        {isAdmin && link('/settings', 'Settings', 'settings')}
      </nav>

      <div className="sidebar__foot">
        <div className="whoami">
          <span className="whoami__av">{initials(user?.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="whoami__name">{user?.name}</div>
            <div className="whoami__role">{user?.role}</div>
          </div>
        </div>
        <button className="btn btn--sm btn--block" style={{ marginTop: 9 }} onClick={signOut}>Switch user</button>
      </div>
    </aside>
  );
}

export default function App() {
  const { loading, error, user, reload } = useApp();
  const [counts, setCounts] = useState({ myOpenTasks: 0, overdueTasks: 0, queue: 0, overdueFollowUps: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  /* Sidebar badges are refreshed on navigation so a task completed on
     one page is reflected in the count on the next. */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [taskCounts, queue, dash] = await Promise.all([
          api.tasks.counts({ scope: 'mine' }),
          api.dashboard.queue({ limit: 200 }),
          api.dashboard.get(),
        ]);
        if (cancelled) return;
        setCounts({
          myOpenTasks: taskCounts.open,
          overdueTasks: taskCounts.overdue,
          queue: queue.data.length,
          overdueFollowUps: dash.mine.summary.follow_ups_overdue,
        });
      } catch {
        /* badges are a nicety — never block the page on them */
      }
    })();
    return () => { cancelled = true; };
  }, [user, location.pathname]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (loading) {
    return <div style={{ padding: 40 }}><Loading rows={6} label="Starting up" /></div>;
  }

  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 560, margin: '0 auto' }}>
        <ErrorBox error={error} onRetry={reload} />
        <p className="muted mt">
          Is the API running? Start it with <code>npm start</code> in <code>/server</code>.
        </p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="shell">
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
      <Sidebar counts={counts} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn--ghost btn--sm menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
          <GlobalSearch onPick={(path) => navigate(path)} />
          <span className="topbar__spacer" />
          <span className="topbar__sub nowrap">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-work" element={<MyWork />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/team" element={<TeamActivity />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/performance/:id" element={<Performance />} />
          <Route path="/import" element={<ImportLeads />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
