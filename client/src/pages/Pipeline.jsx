import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Badge, Empty, ErrorBox, Loading, Owner, fmtMoney, fmtRelative, useToast } from '../components/ui.jsx';

/**
 * A board of the pipeline, one column per active status. Dragging a
 * card moves the lead — the same PATCH the detail page sends, so the
 * status change is audited identically either way.
 */
export default function Pipeline() {
  const { activeStatuses, users, canSeeTeam, user } = useApp();
  const { success, error: toastError } = useToast();

  const [byStatus, setByStatus] = useState({});
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [owner, setOwner] = useState(canSeeTeam ? '' : String(user.id));
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = owner ? { owner_id: owner } : {};
      const [totals, ...lists] = await Promise.all([
        api.analytics.byStatus(filter),
        ...activeStatuses.map((s) => api.leads.list({ ...filter, status_id: s.id, per_page: 50, sort: 'updated_at', dir: 'desc' })),
      ]);
      setCounts(totals.data);
      const map = {};
      activeStatuses.forEach((s, i) => { map[s.id] = lists[i]; });
      setByStatus(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeStatuses, owner]);

  useEffect(() => { if (activeStatuses.length) load(); }, [load, activeStatuses.length]);

  const move = async (leadId, statusId) => {
    const from = Object.values(byStatus).flatMap((r) => r?.data ?? []).find((l) => l.id === leadId);
    if (!from || from.status_id === statusId) return;
    try {
      await api.leads.update(leadId, { status_id: statusId });
      success(`${from.business_name} moved`);
      await load();
    } catch (err) {
      toastError(err.message);
    }
  };

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (loading && !counts.length) return <div className="page"><Loading rows={6} /></div>;

  const totalFor = (id) => counts.find((c) => c.id === id)?.count ?? 0;
  const valueFor = (id) => counts.find((c) => c.id === id)?.value ?? 0;

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Pipeline</h1>
          <div className="topbar__sub">Drag a card to move the lead. Columns come from Settings.</div>
        </div>
        <span className="topbar__spacer" />
        {canSeeTeam && (
          <select className="select" style={{ width: 'auto' }} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Whole team</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </header>

      <div className="page">
        <div className="board">
          {activeStatuses.map((s) => {
            const list = byStatus[s.id];
            const rows = list?.data ?? [];
            const total = totalFor(s.id);

            return (
              <section
                key={s.id}
                className={`board__col ${overCol === s.id ? 'is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverCol(s.id); }}
                onDragLeave={() => setOverCol((c) => (c === s.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  if (dragId) move(dragId, s.id);
                  setDragId(null);
                }}
              >
                <header className="board__head">
                  <Badge color={s.color} dot>{s.name}</Badge>
                  <span className="n">{total}</span>
                </header>

                <div className="board__list">
                  {rows.length === 0 && <p className="muted small" style={{ padding: '4px 2px', margin: 0 }}>Empty</p>}

                  {rows.map((l) => (
                    <article
                      key={l.id}
                      className={`board__card ${dragId === l.id ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    >
                      <h4><Link to={`/leads/${l.id}`}>{l.business_name}</Link></h4>
                      <div className="meta">
                        {l.niche && <span>{l.niche}</span>}
                        {l.city && <span>· {l.city}</span>}
                      </div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        <Owner name={l.owner_name} />
                        {l.estimated_value != null && <span className="spacer" />}
                        {l.estimated_value != null && <span className="bold">{fmtMoney(l.estimated_value)}</span>}
                      </div>
                      <div className="meta" style={{ marginTop: 3 }}>
                        <span className="muted">{l.last_activity_at ? fmtRelative(l.last_activity_at) : 'never touched'}</span>
                      </div>
                    </article>
                  ))}

                  {total > rows.length && (
                    <Link className="btn btn--sm" to={`/leads?status_id=${s.id}${owner ? `&owner_id=${owner}` : ''}`}>
                      See all {total} →
                    </Link>
                  )}
                </div>

                {valueFor(s.id) > 0 && (
                  <footer style={{ padding: '7px 11px', borderTop: '1px solid var(--line)', fontSize: 11.5 }} className="muted">
                    {fmtMoney(valueFor(s.id))} in this column
                  </footer>
                )}
              </section>
            );
          })}
        </div>

        {activeStatuses.length === 0 && (
          <div className="panel">
            <Empty title="No active statuses">Add some in Settings and the board fills in.</Empty>
          </div>
        )}
      </div>
    </>
  );
}
