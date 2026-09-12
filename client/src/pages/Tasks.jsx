import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  ConfirmModal, DueDate, Empty, ErrorBox, Loading, Owner, Pager, useToast,
} from '../components/ui.jsx';
import { TaskModal } from '../components/modals.jsx';

const VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue', alert: true },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

export default function Tasks() {
  const { users, canSeeTeam, user } = useApp();
  const { success, error: toastError } = useToast();

  const [view, setView] = useState('open');
  const [scope, setScope] = useState('mine');
  const [assignee, setAssignee] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = {
        view,
        page,
        per_page: 50,
        ...(scope === 'mine' ? { assigned_to: user.id } : {}),
        ...(scope === 'team' && assignee ? { assigned_to: assignee } : {}),
      };
      const [list, c] = await Promise.all([
        api.tasks.list(filter),
        api.tasks.counts({ scope }),
      ]);
      setRes(list);
      setCounts(c);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view, page, scope, assignee, user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, scope, assignee]);

  const setStatus = async (id, status) => {
    try {
      await api.tasks.update(id, { status });
      await load();
    } catch (err) {
      toastError(err.message);
    }
  };

  const rows = res?.data ?? [];
  const ids = [...selected];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Tasks</h1>
          <div className="topbar__sub">
            {counts.overdue > 0 ? `${counts.overdue} overdue` : 'Nothing overdue'} · {counts.open ?? 0} open
          </div>
        </div>
        <span className="topbar__spacer" />
        <button className="btn btn--primary" onClick={() => setCreating(true)}>+ New task</button>
      </header>

      <div className="page">
        <div className="panel">
          <div className="filterbar">
            <div className="tabs" style={{ border: 0 }}>
              {VIEWS.map((v) => (
                <button key={v.key} className={`tab ${view === v.key ? 'is-active' : ''}`} onClick={() => setView(v.key)}>
                  {v.label}
                  {counts[v.key] > 0 && <span className={`n ${v.alert ? 'is-alert' : ''}`}>{counts[v.key]}</span>}
                </button>
              ))}
            </div>

            <span className="spacer" />

            {canSeeTeam && (
              <>
                <select className="select" style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="mine">My tasks</option>
                  <option value="team">Team tasks</option>
                </select>
                {scope === 'team' && (
                  <select className="select" style={{ width: 'auto' }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">Everyone</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
              </>
            )}
          </div>

          {error && <div style={{ padding: 14 }}><ErrorBox error={error} onRetry={load} /></div>}
          {loading && !res && <Loading rows={6} />}

          {res && rows.length === 0 && (
            <Empty
              title={view === 'overdue' ? 'Nothing overdue' : view === 'completed' ? 'Nothing completed yet' : 'No tasks here'}
              action={<button className="btn btn--primary" onClick={() => setCreating(true)}>Create a task</button>}
            >
              {view === 'overdue' ? 'Everything with a due date is on time.' : 'Tasks you create show up here.'}
            </Empty>
          )}

          {rows.length > 0 && (
            <>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                          aria-label="Select all"
                        />
                      </th>
                      <th style={{ width: 30 }} />
                      <th>Task</th>
                      <th>Lead</th>
                      <th>Priority</th>
                      <th>Due</th>
                      <th>Assigned to</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const done = t.status === 'Completed';
                      return (
                        <tr key={t.id} className={selected.has(t.id) ? 'is-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={() => setSelected((cur) => {
                                const next = new Set(cur);
                                if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                                return next;
                              })}
                              aria-label={`Select ${t.title}`}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => setStatus(t.id, done ? 'To Do' : 'Completed')}
                              aria-label={`Mark ${t.title} ${done ? 'not done' : 'done'}`}
                            />
                          </td>
                          <td>
                            <div className="cell-main" style={done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                              {t.title}
                            </div>
                            {t.description && <div className="cell-sub truncate">{t.description}</div>}
                          </td>
                          <td>{t.lead_id ? <Link to={`/leads/${t.lead_id}`}>{t.lead_business_name}</Link> : <span className="muted">—</span>}</td>
                          <td className="nowrap"><span className="pill">{t.priority}</span></td>
                          <td className="nowrap"><DueDate value={t.due_date} done={done} /></td>
                          <td className="nowrap"><Owner name={t.assigned_to_name} /></td>
                          <td className="nowrap">
                            <select
                              className="select"
                              style={{ width: 'auto', minHeight: 26, padding: '2px 6px' }}
                              value={t.status}
                              onChange={(e) => setStatus(t.id, e.target.value)}
                            >
                              {['To Do', 'In Progress', 'Completed', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="nowrap">
                            <div className="btnrow">
                              <button className="btn btn--sm btn--ghost" onClick={() => setEditing(t)}>Edit</button>
                              <button className="btn btn--sm btn--ghost" onClick={() => setConfirm(t)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pager page={res.page} totalPages={res.total_pages} total={res.total} perPage={res.per_page} onPage={setPage} />
            </>
          )}
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <strong>{selected.size} selected</strong>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await api.tasks.bulkStatus(ids, 'Completed');
                  success(`${ids.length} task(s) completed`);
                  await load();
                } catch (err) { toastError(err.message); }
              }}
            >
              Mark completed
            </button>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await api.tasks.bulkStatus(ids, 'Cancelled');
                  success(`${ids.length} task(s) cancelled`);
                  await load();
                } catch (err) { toastError(err.message); }
              }}
            >
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>

      {creating && <TaskModal onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} onSaved={load} />}

      {confirm && (
        <ConfirmModal
          title="Delete this task?"
          message={`"${confirm.title}" will be removed. This cannot be undone.`}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await api.tasks.remove(confirm.id);
              success('Task deleted');
              setConfirm(null);
              await load();
            } catch (err) { toastError(err.message); }
          }}
        />
      )}
    </>
  );
}
