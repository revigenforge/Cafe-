import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Empty, ErrorBox, Loading, Owner } from '../components/ui.jsx';

/**
 * How the team is doing. Deliberately built around questions a manager
 * needs answered — who has work, who is following up, where leads stick —
 * rather than a leaderboard. Every column reuses the shared metric
 * definitions, so a person's row here matches their own dashboard.
 */
export default function Performance() {
  const { id } = useParams();
  const { canSeeTeam, user, metricDefinitions } = useApp();

  const [range, setRange] = useState({ date_from: '', date_to: '' });
  const [rows, setRows] = useState(null);
  const [person, setPerson] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('leads_assigned');

  const targetId = id ? Number(id) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = Object.fromEntries(Object.entries(range).filter(([, v]) => v !== ''));
      if (targetId) {
        setPerson(await api.analytics.person(targetId, f));
        setRows(null);
      } else if (canSeeTeam) {
        const r = await api.analytics.performance(f);
        setRows(r.data);
        setPerson(null);
      } else {
        setPerson(await api.analytics.person(user.id, f));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range, targetId, canSeeTeam, user.id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (loading && !rows && !person) return <div className="page"><Loading rows={8} /></div>;

  const DateRange = (
    <div className="row">
      <input className="input" style={{ width: 'auto' }} type="date" value={range.date_from} onChange={(e) => setRange((r) => ({ ...r, date_from: e.target.value }))} aria-label="From" />
      <span className="muted">→</span>
      <input className="input" style={{ width: 'auto' }} type="date" value={range.date_to} onChange={(e) => setRange((r) => ({ ...r, date_to: e.target.value }))} aria-label="To" />
      {(range.date_from || range.date_to) && (
        <button className="btn btn--sm" onClick={() => setRange({ date_from: '', date_to: '' })}>All time</button>
      )}
    </div>
  );

  /* ── one person ── */
  if (person) {
    const s = person.summary;
    const maxType = Math.max(1, ...person.by_type.map((t) => t.count));
    const maxOut = Math.max(1, ...person.by_outcome.map((t) => t.count));

    return (
      <>
        <header className="topbar" style={{ borderTop: 0 }}>
          <div>
            <h1>{person.user.name}</h1>
            <div className="topbar__sub">
              {canSeeTeam && <><Link to="/performance">Performance</Link> · </>}
              {person.user.role}
            </div>
          </div>
          <span className="topbar__spacer" />
          {DateRange}
        </header>

        <div className="page">
          <div className="grid grid--stats mb">
            <div className="stat"><div className="stat__k">Leads assigned</div><div className="stat__v">{s.total_leads}</div></div>
            <div className="stat" title={metricDefinitions.contacted_lead}><div className="stat__k">Contacted</div><div className="stat__v">{s.contacted_leads}</div><div className="stat__note">{s.contact_rate}% of their book</div></div>
            <div className="stat" title={metricDefinitions.outreach_attempt}><div className="stat__k">Activities</div><div className="stat__v">{s.total_activities}</div></div>
            <div className="stat"><div className="stat__k">Meetings</div><div className="stat__v">{s.meetings_booked}</div></div>
            <div className="stat"><div className="stat__k">Converted</div><div className="stat__v is-good">{s.converted_leads}</div><div className="stat__note">{s.conversion_rate}% conversion</div></div>
            <div className="stat"><div className="stat__k">Overdue follow-ups</div><div className={`stat__v ${s.follow_ups_overdue ? 'is-alert' : ''}`}>{s.follow_ups_overdue}</div></div>
            <div className="stat"><div className="stat__k">Tasks completed</div><div className="stat__v">{s.tasks_completed}</div></div>
            <div className="stat"><div className="stat__k">Tasks overdue</div><div className={`stat__v ${s.tasks_overdue ? 'is-alert' : ''}`}>{s.tasks_overdue}</div></div>
          </div>

          <div className="grid grid--2">
            <div className="panel">
              <div className="panel__head"><h2>What they do</h2></div>
              <div className="panel__body">
                {person.by_type.length === 0 ? <Empty title="No activity in this range" /> : (
                  <div className="bars">
                    {person.by_type.map((t) => (
                      <div className="bars__row" key={t.label}>
                        <span>{t.label}</span>
                        <div className="bars__bar"><div className="bars__fill" style={{ width: `${(t.count / maxType) * 100}%` }} /></div>
                        <span className="bars__n">{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel__head"><h2>How it lands</h2></div>
              <div className="panel__body">
                {person.by_outcome.length === 0 ? <Empty title="No outcomes recorded" /> : (
                  <div className="bars">
                    {person.by_outcome.map((t) => (
                      <div className="bars__row" key={t.label}>
                        <span className="truncate" title={t.label}>{t.label}</span>
                        <div className="bars__bar"><div className="bars__fill" style={{ width: `${(t.count / maxOut) * 100}%` }} /></div>
                        <span className="bars__n">{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="muted small mt">
            Leads with no activity for a week: <strong>{s.stale_leads}</strong>. Follow-ups due: <strong>{s.follow_ups_due}</strong>.
          </p>
        </div>
      </>
    );
  }

  /* ── the team ── */
  const sorted = [...(rows ?? [])].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
  const totals = (rows ?? []).reduce((acc, r) => {
    for (const k of ['leads_assigned', 'leads_contacted', 'activities_logged', 'meetings_booked', 'proposals_sent', 'conversions', 'follow_ups_overdue', 'tasks_overdue', 'tasks_completed']) {
      acc[k] = (acc[k] ?? 0) + (r[k] ?? 0);
    }
    return acc;
  }, {});

  const col = (key, label, definition) => (
    <th
      className="num sortable"
      onClick={() => setSort(key)}
      title={definition}
      key={key}
    >
      {label}{sort === key && <span className="sortarrow">↓</span>}
    </th>
  );

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Performance</h1>
          <div className="topbar__sub">Who has work, who is following up, and where leads are sticking</div>
        </div>
        <span className="topbar__spacer" />
        {DateRange}
      </header>

      <div className="page">
        {sorted.length === 0 ? (
          <div className="panel"><Empty title="No salespeople yet">Add users in Settings.</Empty></div>
        ) : (
          <div className="panel">
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Salesperson</th>
                    {col('leads_assigned', 'Leads')}
                    {col('leads_contacted', 'Contacted', metricDefinitions.contacted_lead)}
                    {col('activities_logged', 'Activities', metricDefinitions.outreach_attempt)}
                    {col('activities_per_working_day', 'Per day', metricDefinitions.working_day)}
                    {col('meetings_booked', 'Meetings')}
                    {col('proposals_sent', 'Proposals')}
                    {col('conversions', 'Won')}
                    {col('conversion_rate', 'Conv %', metricDefinitions.conversion_rate)}
                    {col('follow_ups_overdue', 'Overdue', metricDefinitions.follow_up_overdue)}
                    {col('tasks_overdue', 'Tasks late', metricDefinitions.task_overdue)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.user_id}>
                      <td className="nowrap">
                        <Link to={`/performance/${r.user_id}`}><Owner name={r.name} /></Link>
                      </td>
                      <td className="num">{r.leads_assigned}</td>
                      <td className="num">
                        {r.leads_contacted}
                        {r.leads_assigned > 0 && <span className="muted small"> ({r.contact_rate}%)</span>}
                      </td>
                      <td className="num">{r.activities_logged}</td>
                      <td className="num">{r.activities_per_working_day || <span className="muted">—</span>}</td>
                      <td className="num">{r.meetings_booked}</td>
                      <td className="num">{r.proposals_sent}</td>
                      <td className="num bold">{r.conversions}</td>
                      <td className="num">{r.conversion_rate}%</td>
                      <td className="num">
                        {r.follow_ups_overdue > 0 ? <span className="pill is-overdue">{r.follow_ups_overdue}</span> : <span className="muted">0</span>}
                      </td>
                      <td className="num">
                        {r.tasks_overdue > 0 ? <span className="pill is-overdue">{r.tasks_overdue}</span> : <span className="muted">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: '#fafbfc' }}>
                    <td>Team</td>
                    <td className="num">{totals.leads_assigned}</td>
                    <td className="num">{totals.leads_contacted}</td>
                    <td className="num">{totals.activities_logged}</td>
                    <td className="num muted">—</td>
                    <td className="num">{totals.meetings_booked}</td>
                    <td className="num">{totals.proposals_sent}</td>
                    <td className="num">{totals.conversions}</td>
                    <td className="num muted">—</td>
                    <td className="num">{totals.follow_ups_overdue}</td>
                    <td className="num">{totals.tasks_overdue}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="warnbox mt small">
          <strong>Read this as a diagnostic, not a scoreboard.</strong> A low activity count next to a
          high conversion rate is not a problem. Overdue follow-ups and untouched leads are the
          columns worth acting on — they show where work is stalling, not who is slacking.
        </div>
      </div>
    </>
  );
}
