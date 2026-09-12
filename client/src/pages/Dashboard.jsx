import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import {
  Badge, DueDate, Empty, ErrorBox, Loading, Owner, fmtRelative, fmtDate,
} from '../components/ui.jsx';
import { LeadModal, LogActivityModal, TaskModal } from '../components/modals.jsx';

function Stat({ label, value, note, tone, to }) {
  const body = (
    <>
      <div className="stat__k">{label}</div>
      <div className={`stat__v ${tone === 'alert' && value > 0 ? 'is-alert' : tone === 'good' ? 'is-good' : ''}`}>{value}</div>
      {note && <div className="stat__note">{note}</div>}
    </>
  );
  if (to) return <Link to={to} className="stat stat--clickable" style={{ display: 'block' }}>{body}</Link>;
  return <div className="stat">{body}</div>;
}

function LeadRow({ lead, onLog }) {
  return (
    <tr>
      <td>
        <Link to={`/leads/${lead.id}`} className="cell-main">{lead.business_name}</Link>
        <div className="cell-sub">{[lead.contact_name, lead.city].filter(Boolean).join(' · ') || '—'}</div>
      </td>
      <td><Badge color={lead.status_color}>{lead.status_name}</Badge></td>
      <td className="nowrap"><DueDate value={lead.next_follow_up_at} /></td>
      <td className="nowrap muted small">{lead.last_activity_at ? fmtRelative(lead.last_activity_at) : 'never'}</td>
      <td className="nowrap">
        <button className="btn btn--sm" onClick={() => onLog(lead)}>Log</button>
      </td>
    </tr>
  );
}

function LeadPanel({ title, leads, empty, onLog, tone }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        <span className="spacer" />
        <span className={`pill ${tone === 'alert' && leads.length ? 'is-overdue' : ''}`}>{leads.length}</span>
      </div>
      {leads.length === 0 ? (
        <Empty title={empty} />
      ) : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr><th>Lead</th><th>Status</th><th>Follow-up</th><th>Last touch</th><th /></tr>
            </thead>
            <tbody>
              {leads.slice(0, 8).map((l) => <LeadRow key={l.id} lead={l} onLog={onLog} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, canSeeTeam } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(null);
  const [showLead, setShowLead] = useState(false);
  const [showTask, setShowTask] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.dashboard.get());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><Loading rows={8} /></div>;

  const s = data.mine.summary;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>{greet}, {user.name.split(' ')[0]}</h1>
          <div className="topbar__sub">
            {s.follow_ups_overdue > 0
              ? `${s.follow_ups_overdue} follow-up${s.follow_ups_overdue === 1 ? '' : 's'} overdue — start there`
              : s.follow_ups_due > 0
                ? `${s.follow_ups_due} follow-up${s.follow_ups_due === 1 ? '' : 's'} due today`
                : 'Nothing overdue. Work the queue or add new leads.'}
          </div>
        </div>
        <span className="topbar__spacer" />
        <div className="btnrow">
          <button className="btn" onClick={() => setShowTask(true)}>+ Task</button>
          <button className="btn" onClick={() => setShowLead(true)}>+ Lead</button>
          <button className="btn btn--primary" onClick={() => navigate('/queue')}>Work the queue</button>
        </div>
      </header>

      <div className="page">
        <div className="grid grid--stats mb">
          <Stat label="My leads" value={s.total_leads} to="/leads" />
          <Stat label="Follow-ups due" value={s.follow_ups_due} to="/queue" />
          <Stat label="Overdue" value={s.follow_ups_overdue} tone="alert" to="/queue" />
          <Stat label="Tasks overdue" value={s.tasks_overdue} tone="alert" to="/tasks" />
          <Stat label="Meetings booked" value={s.meetings_booked} />
          <Stat label="Converted" value={s.converted_leads} tone="good" note={`${s.conversion_rate}% of my leads`} />
        </div>

        <div className="grid grid--2 mb">
          <LeadPanel
            title="Overdue follow-ups"
            leads={data.mine.follow_ups_overdue}
            empty="Nothing overdue — good."
            onLog={setLogging}
            tone="alert"
          />
          <LeadPanel
            title="Due today"
            leads={data.mine.follow_ups_today}
            empty="No follow-ups scheduled for today."
            onLog={setLogging}
          />
        </div>

        <div className="grid grid--2 mb">
          <LeadPanel
            title="New leads to work"
            leads={data.mine.new_leads}
            empty="No new leads waiting."
            onLog={setLogging}
          />
          <LeadPanel
            title="Gone quiet"
            leads={data.mine.stale_leads}
            empty="Everything has been touched recently."
            onLog={setLogging}
          />
        </div>

        <div className="grid grid--2">
          <div className="panel">
            <div className="panel__head">
              <h2>Tasks due</h2>
              <span className="spacer" />
              <Link to="/tasks" className="small">All tasks</Link>
            </div>
            {data.mine.tasks_today.length === 0 ? (
              <Empty title="No tasks due today." />
            ) : (
              <div className="tablewrap">
                <table className="data">
                  <tbody>
                    {data.mine.tasks_today.map((t) => (
                      <tr key={t.id}>
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

          <div className="panel">
            <div className="panel__head"><h2>What I did recently</h2></div>
            <div className="panel__body">
              {data.mine.recent_activity.length === 0 ? (
                <Empty title="No activity logged yet." >
                  Log a call or a message after you make it and it shows up here.
                </Empty>
              ) : (
                <div className="timeline">
                  {data.mine.recent_activity.map((a) => (
                    <div className="tl-item" key={a.id}>
                      <div className="tl-head">
                        <strong>{a.activity_type_name}</strong>
                        {a.outcome_name && <Badge color="slate">{a.outcome_name}</Badge>}
                        <Link to={`/leads/${a.lead_id}`}>{a.business_name}</Link>
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

        {canSeeTeam && data.team && (
          <>
            <h2 style={{ margin: '26px 0 12px', fontSize: 15 }}>The team today</h2>

            <div className="grid grid--stats mb">
              <Stat label="Team leads" value={data.team.summary.total_leads} />
              <Stat label="Unassigned" value={data.team.unassigned_leads} tone="alert" to="/leads?owner_id=unassigned" />
              <Stat label="Activities today" value={data.team.activities_today} />
              <Stat label="Follow-ups due" value={data.team.summary.follow_ups_due} />
              <Stat label="Overdue" value={data.team.summary.follow_ups_overdue} tone="alert" />
              <Stat label="Converted" value={data.team.summary.converted_leads} tone="good" note={`${data.team.summary.conversion_rate}% overall`} />
            </div>

            <div className="panel">
              <div className="panel__head">
                <h2>Who is doing what</h2>
                <span className="spacer" />
                <Link to="/performance" className="small">Full performance</Link>
              </div>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Salesperson</th>
                      <th className="num">Leads</th>
                      <th className="num">Contacted</th>
                      <th className="num">Activities</th>
                      <th className="num">Meetings</th>
                      <th className="num">Won</th>
                      <th className="num">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.by_person.map((p) => (
                      <tr key={p.user_id}>
                        <td><Link to={`/performance/${p.user_id}`}><Owner name={p.name} /></Link></td>
                        <td className="num">{p.leads}</td>
                        <td className="num">{p.contacted}</td>
                        <td className="num">{p.activities}</td>
                        <td className="num">{p.meetings}</td>
                        <td className="num">{p.converted}</td>
                        <td className="num">
                          {p.follow_ups_overdue > 0
                            ? <span className="pill is-overdue">{p.follow_ups_overdue}</span>
                            : <span className="muted">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {logging && <LogActivityModal lead={logging} onClose={() => setLogging(null)} onSaved={load} />}
      {showLead && <LeadModal onClose={() => setShowLead(false)} onSaved={load} />}
      {showTask && <TaskModal onClose={() => setShowTask(false)} onSaved={load} />}
    </>
  );
}
