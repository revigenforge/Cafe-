import { useCallback, useEffect, useState } from 'react';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, Field, useToast } from '../components/ui.jsx';

const COLLECTIONS = [
  { key: 'statuses', label: 'Statuses', hasColor: true, hasFunnel: true },
  { key: 'lead_sources', label: 'Lead sources' },
  { key: 'priorities', label: 'Priorities', hasColor: true, hasWeight: true },
  { key: 'activity_types', label: 'Activity types' },
  { key: 'activity_outcomes', label: 'Activity outcomes', hasContact: true },
];

const COLOURS = ['blue', 'cyan', 'violet', 'indigo', 'teal', 'amber', 'orange', 'green', 'rose', 'red', 'slate'];

function LookupEditor({ cfg, funnelStages, onChanged }) {
  const { success, error: toastError } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.settings.list(cfg.key));
    } catch (err) {
      setError(err.message);
    }
  }, [cfg.key]);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    setBusy(true);
    try {
      if (form.id) await api.settings.update(cfg.key, form.id, form);
      else await api.settings.create(cfg.key, form);
      success('Saved');
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    setBusy(true);
    try {
      await api.settings.remove(cfg.key, row.id);
      success(`${row.name} removed`);
      setConfirm(null);
      await load();
      onChanged?.();
    } catch (err) {
      toastError(err.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.settings.update(cfg.key, row.id, { active: row.active ? 0 : 1 });
      await load();
      onChanged?.();
    } catch (err) {
      toastError(err.message);
    }
  };

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Loading rows={4} />;

  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <h2>{cfg.label}</h2>
          <span className="spacer" />
          <button className="btn btn--sm btn--primary" onClick={() => setEditing({ name: '', color: 'slate', sort_order: (rows.length + 1) * 10, active: 1 })}>
            + Add
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty title={`No ${cfg.label.toLowerCase()} yet`} />
        ) : (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  {cfg.hasFunnel && <th>Counts as funnel stage</th>}
                  {cfg.hasFunnel && <th>Closes the lead</th>}
                  {cfg.hasWeight && <th className="num">Weight</th>}
                  {cfg.hasContact && <th>Counts as contact</th>}
                  <th className="num">Order</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={r.active ? undefined : { opacity: .55 }}>
                    <td>
                      {cfg.hasColor ? <Badge color={r.color} dot>{r.name}</Badge> : <span className="cell-main">{r.name}</span>}
                      {r.is_default === 1 && <span className="pill" style={{ marginLeft: 6 }}>default</span>}
                    </td>

                    {cfg.hasFunnel && (
                      <td>
                        {r.funnel_stage
                          ? <span className="pill">{funnelStages.find((f) => f.code === r.funnel_stage)?.label ?? r.funnel_stage}</span>
                          : <span className="muted">outside the funnel</span>}
                      </td>
                    )}
                    {cfg.hasFunnel && (
                      <td>
                        {r.is_won ? <span className="pill is-done">won</span> : r.is_lost ? <span className="pill is-overdue">lost</span> : <span className="muted">—</span>}
                      </td>
                    )}
                    {cfg.hasWeight && <td className="num">{r.weight}</td>}
                    {cfg.hasContact && (
                      <td>{r.counts_as_contact ? <span className="pill is-done">yes</span> : <span className="muted">no</span>}</td>
                    )}

                    <td className="num muted">{r.sort_order}</td>
                    <td>
                      <label className="checkline">
                        <input type="checkbox" checked={!!r.active} onChange={() => toggleActive(r)} aria-label={`${r.name} active`} />
                      </label>
                    </td>
                    <td className="nowrap">
                      <div className="btnrow">
                        <button className="btn btn--sm btn--ghost" onClick={() => setEditing(r)}>Edit</button>
                        <button className="btn btn--sm btn--ghost" onClick={() => setConfirm(r)} disabled={r.is_default === 1}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cfg.hasFunnel && (
          <div className="panel__body" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="muted small" style={{ margin: 0 }}>
              Renaming a status is safe. Reports group by the <strong>funnel stage</strong> you map it to,
              not by its name, so analytics keep working after a rename. A status with no stage sits
              outside the funnel entirely.
            </p>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit ${editing.name}` : `New ${cfg.label.replace(/e?s$/, '').toLowerCase()}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn btn--primary" onClick={() => save(editing)} disabled={busy || !editing.name?.trim()}>
                {busy && <span className="spinner" />} Save
              </button>
            </>
          }
        >
          <div className="formgrid">
            <Field label="Name" className="full">
              <input className="input" value={editing.name ?? ''} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} autoFocus />
            </Field>

            {cfg.hasColor && (
              <Field label="Badge colour">
                <select className="select" value={editing.color ?? 'slate'} onChange={(e) => setEditing((f) => ({ ...f, color: e.target.value }))}>
                  {COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            )}

            {cfg.hasFunnel && (
              <>
                <Field label="Funnel stage" hint="What reports count this as">
                  <select
                    className="select"
                    value={editing.funnel_stage ?? ''}
                    onChange={(e) => setEditing((f) => ({ ...f, funnel_stage: e.target.value || null }))}
                  >
                    <option value="">Outside the funnel</option>
                    {funnelStages.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Closes the lead as">
                  <select
                    className="select"
                    value={editing.is_won ? 'won' : editing.is_lost ? 'lost' : ''}
                    onChange={(e) => setEditing((f) => ({
                      ...f,
                      is_won: e.target.value === 'won' ? 1 : 0,
                      is_lost: e.target.value === 'lost' ? 1 : 0,
                    }))}
                  >
                    <option value="">Still open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </Field>
              </>
            )}

            {cfg.hasWeight && (
              <Field label="Weight" hint="Higher sorts first in the queue">
                <input className="input" type="number" min="0" value={editing.weight ?? 0} onChange={(e) => setEditing((f) => ({ ...f, weight: Number(e.target.value) }))} />
              </Field>
            )}

            {cfg.hasContact && (
              <Field label="Counts as reaching the lead" hint="Drives the contact rate">
                <select className="select" value={editing.counts_as_contact ? '1' : '0'} onChange={(e) => setEditing((f) => ({ ...f, counts_as_contact: Number(e.target.value) }))}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </Field>
            )}

            <Field label="Sort order">
              <input className="input" type="number" min="0" value={editing.sort_order ?? 0} onChange={(e) => setEditing((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
            </Field>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmModal
          title={`Delete ${confirm.name}?`}
          message="If anything still uses it, the delete is refused and nothing changes."
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
    </>
  );
}

function UsersEditor() {
  const { success, error: toastError } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.users.list({ include_inactive: true }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing.id) await api.users.update(editing.id, editing);
      else await api.users.create(editing);
      success('Saved');
      setEditing(null);
      await load();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Loading rows={4} />;

  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <h2>Users</h2>
          <span className="spacer" />
          <button className="btn btn--sm btn--primary" onClick={() => setEditing({ name: '', email: '', role: 'SALESPERSON' })}>+ Add user</button>
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={u.active ? undefined : { opacity: .55 }}>
                  <td className="cell-main">{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td><Badge color={u.role === 'ADMIN' ? 'blue' : u.role === 'MANAGER' ? 'violet' : 'teal'}>{u.role}</Badge></td>
                  <td>{u.active ? 'Yes' : 'No'}</td>
                  <td className="nowrap"><button className="btn btn--sm btn--ghost" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel__body" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="muted small" style={{ margin: 0 }}>
            Users are deactivated rather than deleted — their name still has to appear on the leads and
            activities they touched. The last active admin cannot be demoted or deactivated.
          </p>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing.id ? `Edit ${editing.name}` : 'New user'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn btn--primary" onClick={save} disabled={busy || !editing.name?.trim() || !editing.email?.trim()}>
                {busy && <span className="spinner" />} Save
              </button>
            </>
          }
        >
          <div className="formgrid">
            <Field label="Name" className="full">
              <input className="input" value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} autoFocus />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editing.email} onChange={(e) => setEditing((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select className="select" value={editing.role} onChange={(e) => setEditing((f) => ({ ...f, role: e.target.value }))}>
                <option value="SALESPERSON">Salesperson</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            {editing.id && (
              <Field label="Active">
                <select className="select" value={editing.active ? '1' : '0'} onChange={(e) => setEditing((f) => ({ ...f, active: Number(e.target.value) }))}>
                  <option value="1">Active</option>
                  <option value="0">Deactivated</option>
                </select>
              </Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Settings() {
  const { funnelStages, reload, isAdmin } = useApp();
  const [tab, setTab] = useState('users');

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="panel"><Empty title="Admins only">Settings change how the CRM works for everyone.</Empty></div>
      </div>
    );
  }

  const cfg = COLLECTIONS.find((c) => c.key === tab);

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Settings</h1>
          <div className="topbar__sub">Nothing here is hard-coded — the app reads these lists on load</div>
        </div>
      </header>

      <div className="page">
        <div className="tabs mb">
          <button className={`tab ${tab === 'users' ? 'is-active' : ''}`} onClick={() => setTab('users')}>Users</button>
          {COLLECTIONS.map((c) => (
            <button key={c.key} className={`tab ${tab === c.key ? 'is-active' : ''}`} onClick={() => setTab(c.key)}>{c.label}</button>
          ))}
        </div>

        {tab === 'users' ? <UsersEditor /> : <LookupEditor cfg={cfg} funnelStages={funnelStages} onChanged={reload} />}
      </div>
    </>
  );
}
