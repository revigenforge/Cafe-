import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  Badge, ConfirmModal, DueDate, Empty, ErrorBox, Loading, LookupSelect, Owner,
  fmtDate, fmtMoney, fmtRelative, useCopy, useToast,
} from '../components/ui.jsx';
import { LeadModal, LogActivityModal, TaskModal } from '../components/modals.jsx';

/** One line of the history, whatever kind of record produced it. */
function TimelineEntry({ item }) {
  if (item.kind === 'event') {
    const verb = {
      created: 'created this lead',
      assigned: item.to_value ? `assigned it to ${item.to_value}` : 'unassigned it',
      status_changed: `moved it from ${item.from_value ?? '—'} to ${item.to_value}`,
      priority_changed: `set priority to ${item.to_value ?? 'none'}`,
      imported: 'imported this lead',
    }[item.event_type] ?? item.event_type;

    return (
      <div className="tl-item" data-kind="event">
        <div className="tl-head">
          <strong>{item.user_name ?? 'Someone'}</strong>
          <span className="muted">{verb}</span>
          <span className="tl-when">{fmtRelative(item.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tl-item" data-kind="activity">
      <div className="tl-head">
        <strong>{item.user_name ?? 'Someone'}</strong>
        <span className="muted">logged a</span>
        <Badge color="blue">{item.activity_type_name ?? 'activity'}</Badge>
        {item.outcome_name && <Badge color={item.counts_as_contact ? 'green' : 'slate'}>{item.outcome_name}</Badge>}
        {item.duration_minutes ? <span className="muted small">{item.duration_minutes} min</span> : null}
        <span className="tl-when">{fmtDate(item.created_at, { withTime: true })}</span>
      </div>
      {item.notes && <div className="tl-body">{item.notes}</div>}
      {item.follow_up_date && (
        <div className="small muted" style={{ marginTop: 3 }}>
          Next follow-up set to {fmtDate(item.follow_up_date)}
        </div>
      )}
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeStatuses, priorities, users, canAssign, canSeeTeam } = useApp();
  const { success, error: toastError } = useToast();
  const copy = useCopy();

  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [taskFor, setTaskFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setLead(await api.leads.get(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body, message) => {
    setBusy(true);
    try {
      await api.leads.update(lead.id, body);
      success(message);
      await load();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <ErrorBox error={error} onRetry={load} />
        <p className="mt"><Link to="/leads">← Back to leads</Link></p>
      </div>
    );
  }
  if (!lead) return <div className="page"><Loading rows={8} /></div>;

  const merged = [
    ...lead.activities.map((a) => ({ ...a, kind: 'activity' })),
    ...lead.events.map((e) => ({ ...e, kind: 'event' })),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const timeline = tab === 'activities' ? merged.filter((m) => m.kind === 'activity') : merged;
  const openTasks = lead.tasks.filter((t) => !['Completed', 'Cancelled'].includes(t.status));

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="truncate" style={{ maxWidth: '46vw' }}>{lead.business_name}</h1>
          <div className="topbar__sub">
            <Link to="/leads">Leads</Link> · {[lead.niche, lead.city, lead.state].filter(Boolean).join(', ') || 'No location set'}
          </div>
        </div>
        <span className="topbar__spacer" />
        <div className="btnrow">
          <button className="btn" onClick={() => setTaskFor(lead)}>+ Task</button>
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn--primary" onClick={() => setLogging(true)}>Log activity</button>
        </div>
      </header>

      <div className="page">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
          {/* ── left: history ── */}
          <div style={{ minWidth: 0 }}>
            <div className="panel mb">
              <div className="panel__head">
                <div className="tabs" style={{ border: 0 }}>
                  <button className={`tab ${tab === 'all' ? 'is-active' : ''}`} onClick={() => setTab('all')}>
                    Everything <span className="n">{merged.length}</span>
                  </button>
                  <button className={`tab ${tab === 'activities' ? 'is-active' : ''}`} onClick={() => setTab('activities')}>
                    Activities <span className="n">{lead.activities.length}</span>
                  </button>
                </div>
                <span className="spacer" />
                <button className="btn btn--sm btn--primary" onClick={() => setLogging(true)}>Log activity</button>
              </div>
              <div className="panel__body">
                {timeline.length === 0 ? (
                  <Empty title="Nothing logged yet" action={<button className="btn btn--primary" onClick={() => setLogging(true)}>Log the first activity</button>}>
                    Call or message them, then record what happened here.
                  </Empty>
                ) : (
                  <div className="timeline">
                    {timeline.map((item) => <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />)}
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel__head">
                <h2>Tasks</h2>
                <span className="spacer" />
                <button className="btn btn--sm" onClick={() => setTaskFor(lead)}>+ Task</button>
              </div>
              {lead.tasks.length === 0 ? (
                <Empty title="No tasks on this lead" />
              ) : (
                <div className="tablewrap">
                  <table className="data">
                    <tbody>
                      {lead.tasks.map((t) => {
                        const done = t.status === 'Completed';
                        return (
                          <tr key={t.id}>
                            <td style={{ width: 28 }}>
                              <input
                                type="checkbox"
                                checked={done}
                                aria-label={`Mark ${t.title} complete`}
                                onChange={async () => {
                                  try {
                                    await api.tasks.update(t.id, { status: done ? 'To Do' : 'Completed' });
                                    await load();
                                  } catch (err) { toastError(err.message); }
                                }}
                              />
                            </td>
                            <td>
                              <div className="cell-main" style={done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</div>
                              {t.description && <div className="cell-sub">{t.description}</div>}
                            </td>
                            <td className="nowrap"><span className="pill">{t.priority}</span></td>
                            <td className="nowrap"><DueDate value={t.due_date} done={done} /></td>
                            <td className="nowrap"><Owner name={t.assigned_to_name} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── right: the facts and the quick controls ── */}
          <div>
            <div className="panel mb">
              <div className="panel__head"><h2>Where it stands</h2></div>
              <div className="panel__body">
                <div className="field mb">
                  <label>Status</label>
                  <LookupSelect
                    value={lead.status_id}
                    options={activeStatuses}
                    allowEmpty={false}
                    disabled={busy}
                    onChange={(v) => patch({ status_id: v }, 'Status updated')}
                  />
                </div>

                <div className="field mb">
                  <label>Priority</label>
                  <LookupSelect
                    value={lead.priority_id}
                    options={priorities.filter((p) => p.active)}
                    placeholder="None"
                    disabled={busy}
                    onChange={(v) => patch({ priority_id: v }, 'Priority updated')}
                  />
                </div>

                <div className="field mb">
                  <label>Owner</label>
                  <select
                    className="select"
                    value={lead.owner_id ?? ''}
                    disabled={!canAssign || busy}
                    onChange={(e) => patch({ owner_id: e.target.value === '' ? null : Number(e.target.value) }, 'Lead reassigned')}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  {!canAssign && <span className="hint">Only an admin or manager can reassign</span>}
                </div>

                <div className="field">
                  <label>Next follow-up</label>
                  <input
                    className="input"
                    type="date"
                    value={lead.next_follow_up_at?.slice(0, 10) ?? ''}
                    disabled={busy}
                    onChange={(e) => patch({ next_follow_up_at: e.target.value || null }, 'Follow-up scheduled')}
                  />
                </div>
              </div>
            </div>

            <div className="panel mb">
              <div className="panel__head"><h2>Contact</h2></div>
              <div className="panel__body">
                <dl className="kv">
                  <dt>Contact</dt><dd>{lead.contact_name || <span className="muted">—</span>}</dd>
                  <dt>Phone</dt>
                  <dd>
                    {lead.phone ? (
                      <span className="row">
                        <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                        <button className="btn btn--sm btn--ghost" onClick={() => copy(lead.phone, 'Phone copied')}>Copy</button>
                      </span>
                    ) : <span className="muted">—</span>}
                  </dd>
                  <dt>Email</dt>
                  <dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="muted">—</span>}</dd>
                  <dt>Website</dt>
                  <dd>{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="truncate" style={{ display: 'inline-block' }}>{lead.website}</a> : <span className="muted">—</span>}</dd>
                  <dt>Address</dt><dd>{lead.address || <span className="muted">—</span>}</dd>
                  <dt>City</dt><dd>{[lead.city, lead.state].filter(Boolean).join(', ') || <span className="muted">—</span>}</dd>
                </dl>
              </div>
            </div>

            <div className="panel mb">
              <div className="panel__head"><h2>Details</h2></div>
              <div className="panel__body">
                <dl className="kv">
                  <dt>Industry</dt><dd>{lead.industry || <span className="muted">—</span>}</dd>
                  <dt>Niche</dt><dd>{lead.niche || <span className="muted">—</span>}</dd>
                  <dt>Source</dt><dd>{lead.source_name || <span className="muted">—</span>}</dd>
                  <dt>Value</dt><dd>{fmtMoney(lead.estimated_value)}</dd>
                  <dt>Created</dt><dd>{fmtDate(lead.created_at)}</dd>
                  <dt>Last touch</dt><dd>{lead.last_activity_at ? fmtRelative(lead.last_activity_at) : <span className="muted">never</span>}</dd>
                </dl>
                {lead.notes && (
                  <>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Notes</label>
                      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{lead.notes}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {canSeeTeam && (
              <button className="btn btn--danger btn--block" onClick={() => setConfirmDelete(true)}>Delete lead</button>
            )}
          </div>
        </div>
      </div>

      {logging && <LogActivityModal lead={lead} onClose={() => setLogging(false)} onSaved={load} />}
      {editing && <LeadModal lead={lead} onClose={() => setEditing(false)} onSaved={load} />}
      {taskFor && <TaskModal lead={taskFor} onClose={() => setTaskFor(null)} onSaved={load} />}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${lead.business_name}?`}
          message="Every activity and task attached to this lead goes too. This cannot be undone."
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.leads.remove(lead.id);
              success('Lead deleted');
              navigate('/leads');
            } catch (err) {
              toastError(err.message);
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
