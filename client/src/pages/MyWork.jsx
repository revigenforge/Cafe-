import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  Badge, DueDate, Empty, ErrorBox, Loading, fmtRelative, useToast,
} from '../components/ui.jsx';
import { LogActivityModal, TaskModal } from '../components/modals.jsx';

/** Everything assigned to one person, on one page. */
export default function MyWork() {
  const { user } = useApp();
  const { error: toastError } = useToast();

  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(null);
  const [taskFor, setTaskFor] = useState(null);
  const [newTask, setNewTask] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, tasks, acts, leads] = await Promise.all([
        api.dashboard.get(),
        api.tasks.list({ assigned_to: user.id, view: 'open', per_page: 100 }),
        api.activities.list({ user_id: user.id, per_page: 25 }),
        api.leads.list({ owner_id: user.id, per_page: 100, sort: 'next_follow_up_at', dir: 'asc' }),
      ]);
      setState({ dash, tasks: tasks.data, acts: acts.data, leads: leads.data, leadTotal: leads.total });
    } catch (err) {
      setError(err.message);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (!state) return <div className="page"><Loading rows={8} /></div>;

  const s = state.dash.mine.summary;
  const meetings = state.dash.mine.meetings_today;
  const followUps = state.leads.filter((l) => l.next_follow_up_at && !l.status_is_won && !l.status_is_lost);

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>My work</h1>
          <div className="topbar__sub">{state.leadTotal} leads · {state.tasks.length} open tasks · {s.total_activities} activities logged</div>
        </div>
        <span className="topbar__spacer" />
        <div className="btnrow">
          <button className="btn" onClick={() => setNewTask(true)}>+ Task</button>
          <Link className="btn btn--primary" to="/queue">Work the queue</Link>
        </div>
      </header>

      <div className="page">
        <div className="grid grid--stats mb">
          <div className="stat"><div className="stat__k">My leads</div><div className="stat__v">{s.total_leads}</div></div>
          <div className="stat"><div className="stat__k">Due today</div><div className="stat__v">{s.follow_ups_due}</div></div>
          <div className="stat"><div className="stat__k">Overdue</div><div className={`stat__v ${s.follow_ups_overdue ? 'is-alert' : ''}`}>{s.follow_ups_overdue}</div></div>
          <div className="stat"><div className="stat__k">Open tasks</div><div className="stat__v">{state.tasks.length}</div></div>
          <div className="stat"><div className="stat__k">Tasks overdue</div><div className={`stat__v ${s.tasks_overdue ? 'is-alert' : ''}`}>{s.tasks_overdue}</div></div>
          <div className="stat"><div className="stat__k">Converted</div><div className="stat__v is-good">{s.converted_leads}</div></div>
        </div>

        <div className="grid grid--2 mb">
          <div className="panel">
            <div className="panel__head">
              <h2>My follow-ups</h2>
              <span className="spacer" />
              <Link className="small" to="/leads?view=follow_up_due">All</Link>
            </div>
            {followUps.length === 0 ? (
              <Empty title="No follow-ups scheduled">Schedule one when you log an activity.</Empty>
            ) : (
              <div className="tablewrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="data">
                  <tbody>
                    {followUps.slice(0, 20).map((l) => (
                      <tr key={l.id}>
                        <td>
                          <Link to={`/leads/${l.id}`} className="cell-main">{l.business_name}</Link>
                          <div className="cell-sub"><Badge color={l.status_color}>{l.status_name}</Badge></div>
                        </td>
                        <td className="nowrap"><DueDate value={l.next_follow_up_at} /></td>
                        <td className="nowrap"><button className="btn btn--sm" onClick={() => setLogging(l)}>Log</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel__head">
              <h2>My open tasks</h2>
              <span className="spacer" />
              <Link className="small" to="/tasks">All tasks</Link>
            </div>
            {state.tasks.length === 0 ? (
              <Empty title="No open tasks" action={<button className="btn" onClick={() => setNewTask(true)}>Create one</button>} />
            ) : (
              <div className="tablewrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="data">
                  <tbody>
                    {state.tasks.slice(0, 20).map((t) => (
                      <tr key={t.id}>
                        <td style={{ width: 28 }}>
                          <input
                            type="checkbox"
                            aria-label={`Complete ${t.title}`}
                            onChange={async () => {
                              try {
                                await api.tasks.update(t.id, { status: 'Completed' });
                                await load();
                              } catch (err) { toastError(err.message); }
                            }}
                          />
                        </td>
                        <td>
                          <div className="cell-main">{t.title}</div>
                          {t.lead_business_name && <div className="cell-sub">{t.lead_business_name}</div>}
                        </td>
                        <td className="nowrap"><span className="pill">{t.priority}</span></td>
                        <td className="nowrap"><DueDate value={t.due_date} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid--2">
          <div className="panel">
            <div className="panel__head"><h2>Meetings logged today</h2></div>
            {meetings.length === 0 ? (
              <Empty title="No meetings logged today">Log one with type “Meeting” after it happens.</Empty>
            ) : (
              <div className="panel__body">
                <div className="timeline">
                  {meetings.map((m) => (
                    <div className="tl-item" key={m.id}>
                      <div className="tl-head">
                        <Link to={`/leads/${m.lead_id}`}><strong>{m.business_name}</strong></Link>
                        <span className="tl-when">{fmtRelative(m.created_at)}</span>
                      </div>
                      {m.notes && <div className="tl-body small">{m.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel__head"><h2>What I logged recently</h2></div>
            <div className="panel__body">
              {state.acts.length === 0 ? (
                <Empty title="Nothing logged yet" />
              ) : (
                <div className="timeline">
                  {state.acts.slice(0, 15).map((a) => (
                    <div className="tl-item" key={a.id}>
                      <div className="tl-head">
                        <strong>{a.activity_type_name}</strong>
                        {a.outcome_name && <Badge color="slate">{a.outcome_name}</Badge>}
                        <Link to={`/leads/${a.lead_id}`}>{a.lead_business_name}</Link>
                        <span className="tl-when">{fmtRelative(a.created_at)}</span>
                      </div>
                      {a.notes && <div className="tl-body small">{a.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {logging && <LogActivityModal lead={logging} onClose={() => setLogging(null)} onSaved={load} />}
      {newTask && <TaskModal onClose={() => setNewTask(false)} onSaved={load} />}
      {taskFor && <TaskModal lead={taskFor} onClose={() => setTaskFor(null)} onSaved={load} />}
    </>
  );
}
