import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  Badge, Empty, ErrorBox, Loading, Owner, fmtRelative, useCopy, useToast,
} from '../components/ui.jsx';
import { LogActivityModal, TaskModal } from '../components/modals.jsx';

/**
 * One ordered list of everything that deserves attention, worked top to
 * bottom. The CRM never dials anyone — you call or message from your own
 * phone, then log what happened without leaving the row.
 */
export default function Queue() {
  const { user, users, canSeeTeam } = useApp();
  const copy = useCopy();
  const { error: toastError } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  /* A manager's queue is the team's queue — they rarely own leads
     themselves, and showing them an empty list while the team has
     overdue work would be actively misleading. */
  const [owner, setOwner] = useState(canSeeTeam ? 'all' : String(user.id));
  const [cursor, setCursor] = useState(0);
  const [logging, setLogging] = useState(null);
  const [taskFor, setTaskFor] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.dashboard.queue({ owner_id: owner, limit: 100 });
      setData(r);
      setCursor(0);
    } catch (err) {
      setError(err.message);
    }
  }, [owner]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><Loading rows={7} /></div>;

  const rows = data.data;
  const current = rows[cursor];

  const tone = (reason) =>
    reason === 'Follow-up overdue' ? 'red'
      : reason === 'Follow-up due today' ? 'amber'
        : reason.startsWith('New') ? 'blue' : 'slate';

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Sales queue</h1>
          <div className="topbar__sub">
            {rows.length} lead{rows.length === 1 ? '' : 's'} worth a touch today, most urgent first
          </div>
        </div>
        <span className="topbar__spacer" />
        {canSeeTeam && (
          <select className="select" style={{ width: 'auto' }} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">Whole team</option>
            <option value={user.id}>My queue</option>
            {users.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </header>

      <div className="page">
        {rows.length === 0 ? (
          <div className="panel">
            <Empty title="Queue is clear" action={<Link className="btn btn--primary" to="/leads">Browse all leads</Link>}>
              No overdue follow-ups, nothing due today, and nothing has gone quiet. Good place to be.
            </Empty>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 330px', alignItems: 'start' }}>
            {/* the lead being worked */}
            <div className="panel">
              <div className="panel__head">
                <h2>Now: {cursor + 1} of {rows.length}</h2>
                <span className="spacer" />
                <button className="btn btn--sm" disabled={cursor === 0} onClick={() => setCursor((c) => c - 1)}>← Previous</button>
                <button className="btn btn--sm" disabled={cursor >= rows.length - 1} onClick={() => setCursor((c) => c + 1)}>Skip →</button>
              </div>

              <div className="panel__body">
                <div className="row row--wrap mb">
                  <Badge color={tone(current.queue_reason)} dot>{current.queue_reason}</Badge>
                  <Badge color={current.status_color}>{current.status_name}</Badge>
                  {current.priority_name && <Badge color={current.priority_color}>{current.priority_name}</Badge>}
                  <span className="spacer" />
                  <Owner name={current.owner_name} />
                </div>

                <h2 style={{ margin: '0 0 3px', fontSize: 21 }}>
                  <Link to={`/leads/${current.id}`}>{current.business_name}</Link>
                </h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  {[current.contact_name, current.niche, [current.city, current.state].filter(Boolean).join(', ')]
                    .filter(Boolean).join(' · ') || 'No contact details yet'}
                </p>

                <div className="btnrow mb">
                  {current.phone && (
                    <>
                      <a className="btn btn--primary" href={`tel:${current.phone}`}>Call {current.phone}</a>
                      <button className="btn" onClick={() => copy(current.phone, 'Phone copied')}>Copy number</button>
                    </>
                  )}
                  {current.email && <a className="btn" href={`mailto:${current.email}`}>Email</a>}
                  {current.website && <a className="btn" href={current.website} target="_blank" rel="noreferrer">Website</a>}
                </div>

                <div className="warnbox small mb">
                  Call or message from your own phone, then log what happened below. The CRM does not
                  contact anyone for you.
                </div>

                <div className="btnrow">
                  <button className="btn btn--primary" onClick={() => setLogging(current)}>Log what happened</button>
                  <button className="btn" onClick={() => setTaskFor(current)}>Create task</button>
                  <Link className="btn" to={`/leads/${current.id}`}>Open full record</Link>
                  <span className="spacer" />
                  <button
                    className="btn"
                    disabled={cursor >= rows.length - 1}
                    onClick={() => setCursor((c) => c + 1)}
                  >
                    Next lead →
                  </button>
                </div>

                {current.notes && (
                  <div className="mt">
                    <div className="field"><label>Notes</label></div>
                    <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{current.notes}</div>
                  </div>
                )}

                <p className="small muted mt">
                  Last touched {current.last_activity_at ? fmtRelative(current.last_activity_at) : 'never'} ·{' '}
                  {current.activity_count} activit{current.activity_count === 1 ? 'y' : 'ies'} logged
                </p>
              </div>
            </div>

            {/* the rest of the queue */}
            <div className="panel">
              <div className="panel__head"><h2>Up next</h2></div>
              <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                <table className="data">
                  <tbody>
                    {rows.map((l, i) => (
                      <tr key={l.id} className={i === cursor ? 'is-selected' : ''}>
                        <td>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '2px 4px' }}
                            onClick={() => setCursor(i)}
                          >
                            <span className="cell-main">{l.business_name}</span>
                            <span className="cell-sub" style={{ display: 'block' }}>{l.queue_reason}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {logging && (
        <LogActivityModal
          lead={logging}
          onClose={() => setLogging(null)}
          onSaved={async () => {
            /* Advance rather than reload, so the operator keeps their
               place in the list they are working through. */
            await load();
            setCursor((c) => Math.min(c, Math.max(0, rows.length - 2)));
          }}
        />
      )}
      {taskFor && <TaskModal lead={taskFor} onClose={() => setTaskFor(null)} onSaved={load} />}
    </>
  );
}
