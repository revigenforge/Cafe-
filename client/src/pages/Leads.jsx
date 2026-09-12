import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  Badge, ConfirmModal, DueDate, Empty, ErrorBox, Loading, Owner, Pager,
  fmtDate, fmtMoney, fmtRelative, useCopy, useToast,
} from '../components/ui.jsx';
import { LeadModal, LogActivityModal } from '../components/modals.jsx';

/* Which columns exist, and which are on by default. Visibility is kept
   in localStorage so a rep's layout survives a reload. */
const COLUMNS = [
  { key: 'business', label: 'Business', sort: 'business_name', always: true },
  { key: 'contact', label: 'Contact', sort: 'contact_name', on: true },
  { key: 'phone', label: 'Phone', on: true },
  { key: 'email', label: 'Email', on: false },
  { key: 'industry', label: 'Industry', sort: 'industry', on: false },
  { key: 'niche', label: 'Niche', sort: 'niche', on: true },
  { key: 'city', label: 'City', sort: 'city', on: true },
  { key: 'state', label: 'State', sort: 'state', on: false },
  { key: 'source', label: 'Source', sort: 'source', on: false },
  { key: 'status', label: 'Status', sort: 'status', on: true },
  { key: 'priority', label: 'Priority', sort: 'priority', on: true },
  { key: 'owner', label: 'Owner', sort: 'owner', on: true },
  { key: 'value', label: 'Value', sort: 'estimated_value', on: false },
  { key: 'last', label: 'Last activity', sort: 'last_activity_at', on: true },
  { key: 'next', label: 'Next follow-up', sort: 'next_follow_up_at', on: true },
  { key: 'created', label: 'Created', sort: 'created_at', on: false },
];

const COLS_KEY = 'crm.leadcols';

export default function Leads() {
  const { activeStatuses, priorities, sources, users, canAssign, canSeeTeam } = useApp();
  const { success, error: toastError } = useToast();
  const copy = useCopy();
  const [params, setParams] = useSearchParams();

  const [res, setRes] = useState(null);
  const [facets, setFacets] = useState({ industries: [], niches: [], cities: [], states: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [logging, setLogging] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCols, setShowCols] = useState(false);

  const [visible, setVisible] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_KEY));
      if (Array.isArray(saved)) return new Set(saved);
    } catch { /* fall through to defaults */ }
    return new Set(COLUMNS.filter((c) => c.always || c.on).map((c) => c.key));
  });

  useEffect(() => {
    localStorage.setItem(COLS_KEY, JSON.stringify([...visible]));
  }, [visible]);

  // every filter lives in the URL, so a view can be bookmarked and shared
  const q = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const page = Number(q.page) || 1;
  const perPage = Number(q.per_page) || 50;
  const sort = q.sort || 'updated_at';
  const dir = q.dir || 'desc';

  const setQ = useCallback(
    (patch, { resetPage = true } = {}) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.leads.list({ ...q, page, per_page: perPage, sort, dir });
      setRes(data);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, page, perPage, sort, dir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.leads.facets().then(setFacets).catch(() => {}); }, []);

  const rows = res?.data ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggle = (id) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const ids = [...selected];

  const runBulk = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      success(message);
      await load();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const copyPhones = async () => {
    try {
      const r = await api.leads.phones(ids);
      if (!r.count) return toastError('None of the selected leads have a phone number');
      await copy(r.phones.join('\n'), `${r.count} phone number${r.count === 1 ? '' : 's'} copied`);
    } catch (err) {
      toastError(err.message);
    }
  };

  const sortBy = (field) => {
    if (!field) return;
    /* First click on a new column sorts ascending — A→Z is what people
       expect from a header they have not touched yet. Clicking the same
       column again reverses it. */
    if (sort !== field) return setQ({ sort: field, dir: 'asc' });
    setQ({ sort: field, dir: dir === 'asc' ? 'desc' : 'asc' });
  };

  const chips = [];
  const addChip = (key, label) => q[key] && chips.push({ key, label: `${label}: ${labelFor(key, q[key])}` });
  function labelFor(key, value) {
    const find = (arr) => arr.find((x) => String(x.id) === String(value))?.name ?? value;
    if (key === 'status_id') return find(activeStatuses);
    if (key === 'priority_id') return find(priorities);
    if (key === 'source_id') return find(sources);
    if (key === 'owner_id') return value === 'unassigned' ? 'Unassigned' : find(users);
    return value;
  }
  ['status_id', 'priority_id', 'source_id', 'owner_id', 'industry', 'niche', 'city', 'state', 'view', 'search',
   'created_from', 'created_to', 'follow_up_from', 'follow_up_to', 'has_email', 'has_website']
    .forEach((k) => addChip(k, k.replace(/_/g, ' ').replace(/\bid\b/, '').trim()));

  const show = (key) => visible.has(key);

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Leads</h1>
          <div className="topbar__sub">
            {res ? `${res.total.toLocaleString()} lead${res.total === 1 ? '' : 's'}` : 'Loading…'}
            {!canSeeTeam && ' assigned to you'}
          </div>
        </div>
        <span className="topbar__spacer" />
        <div className="btnrow">
          <a className="btn" href={api.leads.exportUrl({ ...q, sort, dir })} download>Export CSV</a>
          <button className="btn btn--primary" onClick={() => setCreating(true)}>+ New lead</button>
        </div>
      </header>

      <div className="page">
        <div className="panel">
          <div className="filterbar">
            <input
              className="input"
              style={{ width: 210 }}
              placeholder="Search this list…"
              defaultValue={q.search ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                clearTimeout(window.__leadSearchT);
                window.__leadSearchT = setTimeout(() => setQ({ search: v }), 300);
              }}
            />

            <select className="select" style={{ width: 'auto' }} value={q.status_id ?? ''} onChange={(e) => setQ({ status_id: e.target.value })}>
              <option value="">Any status</option>
              {activeStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select className="select" style={{ width: 'auto' }} value={q.priority_id ?? ''} onChange={(e) => setQ({ priority_id: e.target.value })}>
              <option value="">Any priority</option>
              {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {canSeeTeam && (
              <select className="select" style={{ width: 'auto' }} value={q.owner_id ?? ''} onChange={(e) => setQ({ owner_id: e.target.value })}>
                <option value="">Any owner</option>
                <option value="unassigned">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}

            <select className="select" style={{ width: 'auto' }} value={q.niche ?? ''} onChange={(e) => setQ({ niche: e.target.value })}>
              <option value="">Any niche</option>
              {facets.niches.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <select className="select" style={{ width: 'auto' }} value={q.state ?? ''} onChange={(e) => setQ({ state: e.target.value })}>
              <option value="">Any state</option>
              {facets.states.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <select className="select" style={{ width: 'auto' }} value={q.view ?? ''} onChange={(e) => setQ({ view: e.target.value })}>
              <option value="">All leads</option>
              <option value="open">Open only</option>
              <option value="follow_up_due">Follow-up due</option>
              <option value="follow_up_overdue">Follow-up overdue</option>
              <option value="stale">Gone quiet</option>
              <option value="unassigned">Unassigned</option>
            </select>

            <span className="spacer" />

            <div style={{ position: 'relative' }}>
              <button className="btn btn--sm" onClick={() => setShowCols((v) => !v)}>Columns</button>
              {showCols && (
                <div className="gsearch__results" style={{ right: 0, left: 'auto', width: 200, padding: 8 }}>
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="checkline" style={{ padding: '3px 4px' }}>
                      <input
                        type="checkbox"
                        checked={show(c.key)}
                        disabled={c.always}
                        onChange={() => setVisible((cur) => {
                          const next = new Set(cur);
                          if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                          return next;
                        })}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {chips.length > 0 && (
            <div className="activefilters">
              {chips.map((c) => (
                <span className="chip" key={c.key}>
                  {c.label}
                  <button onClick={() => setQ({ [c.key]: null })} aria-label={`Remove ${c.label}`}>×</button>
                </span>
              ))}
              <button className="btn btn--sm btn--ghost" onClick={() => setParams({}, { replace: true })}>Clear all</button>
            </div>
          )}

          {error && <div style={{ padding: 14 }}><ErrorBox error={error} onRetry={load} /></div>}

          {loading && !res && <Loading rows={8} />}

          {res && rows.length === 0 && !loading && (
            <Empty
              title="No leads match these filters"
              action={chips.length > 0
                ? <button className="btn" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
                : <button className="btn btn--primary" onClick={() => setCreating(true)}>Add the first lead</button>}
            >
              {chips.length > 0 ? 'Try removing one of the filters above.' : 'Import a CSV or create one by hand.'}
            </Empty>
          )}

          {rows.length > 0 && (
            <>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all on this page" />
                      </th>
                      {COLUMNS.filter((c) => show(c.key)).map((c) => (
                        <th
                          key={c.key}
                          className={c.sort ? 'sortable' : ''}
                          onClick={() => sortBy(c.sort)}
                        >
                          {c.label}
                          {sort === c.sort && <span className="sortarrow">{dir === 'asc' ? '↑' : '↓'}</span>}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id} className={selected.has(l.id) ? 'is-selected' : ''}>
                        <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.business_name}`} /></td>

                        {show('business') && (
                          <td>
                            <Link to={`/leads/${l.id}`} className="cell-main">{l.business_name}</Link>
                            {l.open_task_count > 0 && <span className="pill" style={{ marginLeft: 6 }}>{l.open_task_count} task{l.open_task_count === 1 ? '' : 's'}</span>}
                          </td>
                        )}
                        {show('contact') && <td>{l.contact_name || <span className="muted">—</span>}</td>}
                        {show('phone') && (
                          <td className="nowrap">
                            {l.phone
                              ? <button className="btn btn--sm btn--ghost" onClick={() => copy(l.phone, 'Phone copied')} title="Copy">{l.phone}</button>
                              : <span className="muted">—</span>}
                          </td>
                        )}
                        {show('email') && <td className="truncate">{l.email || <span className="muted">—</span>}</td>}
                        {show('industry') && <td>{l.industry || <span className="muted">—</span>}</td>}
                        {show('niche') && <td>{l.niche || <span className="muted">—</span>}</td>}
                        {show('city') && <td>{l.city || <span className="muted">—</span>}</td>}
                        {show('state') && <td>{l.state || <span className="muted">—</span>}</td>}
                        {show('source') && <td>{l.source_name || <span className="muted">—</span>}</td>}
                        {show('status') && <td><Badge color={l.status_color}>{l.status_name}</Badge></td>}
                        {show('priority') && <td>{l.priority_name ? <Badge color={l.priority_color}>{l.priority_name}</Badge> : <span className="muted">—</span>}</td>}
                        {show('owner') && <td className="nowrap"><Owner name={l.owner_name} /></td>}
                        {show('value') && <td className="num nowrap">{fmtMoney(l.estimated_value)}</td>}
                        {show('last') && <td className="nowrap muted small">{l.last_activity_at ? fmtRelative(l.last_activity_at) : 'never'}</td>}
                        {show('next') && <td className="nowrap"><DueDate value={l.next_follow_up_at} /></td>}
                        {show('created') && <td className="nowrap muted small">{fmtDate(l.created_at)}</td>}

                        <td className="nowrap">
                          <div className="btnrow">
                            <button className="btn btn--sm" onClick={() => setLogging(l)}>Log</button>
                            <button className="btn btn--sm btn--ghost" onClick={() => setEditing(l)}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pager
                page={res.page}
                totalPages={res.total_pages}
                total={res.total}
                perPage={res.per_page}
                onPage={(p) => setQ({ page: p }, { resetPage: false })}
                onPerPage={(n) => setQ({ per_page: n })}
              />
            </>
          )}
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <strong>{selected.size} selected</strong>

            {canAssign && (
              <select
                className="select"
                style={{ width: 'auto' }}
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return;
                  runBulk(() => api.leads.bulkAssign(ids, v === 'unassigned' ? null : Number(v)), `${ids.length} lead(s) reassigned`);
                }}
              >
                <option value="">Assign to…</option>
                <option value="unassigned">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}

            <select
              className="select"
              style={{ width: 'auto' }}
              value=""
              onChange={(e) => e.target.value && runBulk(() => api.leads.bulkStatus(ids, Number(e.target.value)), `${ids.length} lead(s) moved`)}
            >
              <option value="">Set status…</option>
              {activeStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <select
              className="select"
              style={{ width: 'auto' }}
              value=""
              onChange={(e) => e.target.value && runBulk(() => api.leads.bulkPriority(ids, Number(e.target.value)), `${ids.length} lead(s) updated`)}
            >
              <option value="">Set priority…</option>
              {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <button className="btn" onClick={copyPhones}>Copy phones</button>
            <span className="spacer" />
            <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
            {canSeeTeam && (
              <button className="btn btn--danger" onClick={() => setConfirm({ kind: 'bulk' })}>Delete</button>
            )}
          </div>
        )}
      </div>

      {creating && <LeadModal onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <LeadModal lead={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {logging && <LogActivityModal lead={logging} onClose={() => setLogging(null)} onSaved={load} />}

      {confirm?.kind === 'bulk' && (
        <ConfirmModal
          title={`Delete ${ids.length} lead${ids.length === 1 ? '' : 's'}?`}
          message="Their activities and history go too. This cannot be undone."
          confirmLabel={`Delete ${ids.length}`}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => runBulk(() => api.leads.bulkDelete(ids), `${ids.length} lead(s) deleted`)}
        />
      )}
    </>
  );
}
