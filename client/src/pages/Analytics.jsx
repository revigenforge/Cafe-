import { useCallback, useEffect, useState } from 'react';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { ErrorBox, Loading, Empty } from '../components/ui.jsx';

const BREAKDOWNS = [
  { key: 'source', label: 'Source' },
  { key: 'niche', label: 'Niche' },
  { key: 'industry', label: 'Industry' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'owner', label: 'Owner' },
  { key: 'priority', label: 'Priority' },
];

/** A metric tile that can explain its own definition on hover. */
function Metric({ label, value, suffix = '', definition, tone }) {
  return (
    <div className="stat" title={definition || undefined}>
      <div className="stat__k">
        {label}
        {definition && <span className="muted" style={{ marginLeft: 4, cursor: 'help' }}>ⓘ</span>}
      </div>
      <div className={`stat__v ${tone === 'alert' && value > 0 ? 'is-alert' : tone === 'good' ? 'is-good' : ''}`}>
        {value}{suffix}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { users, canSeeTeam, metricDefinitions, statuses, sources } = useApp();

  const [filters, setFilters] = useState({ date_from: '', date_to: '', owner_id: '', niche: '', state: '', source_id: '' });
  const [field, setField] = useState('source');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const [summary, funnel, breakdown, trend] = await Promise.all([
        api.analytics.summary(f),
        api.analytics.funnel(f),
        api.analytics.breakdown({ ...f, field }),
        api.analytics.trend(f),
      ]);
      setData({ summary, funnel, breakdown, trend });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, field]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><Loading rows={9} /></div>;

  const s = data.summary;
  const maxBreak = Math.max(1, ...data.breakdown.data.map((d) => d.count));
  const maxTrend = Math.max(1, ...data.trend.data.map((d) => d.count));

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Analytics</h1>
          <div className="topbar__sub">Every figure uses one shared definition — hover a label to see it</div>
        </div>
        <span className="topbar__spacer" />
        {loading && <span className="spinner" />}
      </header>

      <div className="page">
        <div className="panel mb">
          <div className="filterbar">
            <div className="field"><label>From</label><input className="input" type="date" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} /></div>
            <div className="field"><label>To</label><input className="input" type="date" value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} /></div>

            {canSeeTeam && (
              <div className="field">
                <label>Salesperson</label>
                <select className="select" value={filters.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                  <option value="">Everyone</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}

            <div className="field">
              <label>Source</label>
              <select className="select" value={filters.source_id} onChange={(e) => set('source_id', e.target.value)}>
                <option value="">Any</option>
                {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>

            <div className="field"><label>Niche</label><input className="input" value={filters.niche} onChange={(e) => set('niche', e.target.value)} placeholder="Any" /></div>
            <div className="field"><label>State</label><input className="input" value={filters.state} onChange={(e) => set('state', e.target.value)} placeholder="Any" /></div>

            <span className="spacer" />
            <button className="btn" onClick={() => setFilters({ date_from: '', date_to: '', owner_id: '', niche: '', state: '', source_id: '' })}>Reset</button>
          </div>
        </div>

        <div className="grid grid--stats mb">
          <Metric label="Total leads" value={s.total_leads} />
          <Metric label="New" value={s.new_leads} />
          <Metric label="Contacted" value={s.contacted_leads} definition={metricDefinitions.contacted_lead} />
          <Metric label="Interested" value={s.interested_leads} />
          <Metric label="Meetings" value={s.meetings_booked} />
          <Metric label="Proposals" value={s.proposals_sent} />
          <Metric label="Converted" value={s.converted_leads} tone="good" />
          <Metric label="Lost" value={s.lost_leads} />
        </div>

        <div className="grid grid--stats mb">
          <Metric label="Contact rate" value={s.contact_rate} suffix="%" definition={metricDefinitions.contact_rate} />
          <Metric label="Interest rate" value={s.interest_rate} suffix="%" definition={metricDefinitions.interest_rate} />
          <Metric label="Meeting rate" value={s.meeting_rate} suffix="%" definition={metricDefinitions.meeting_rate} />
          <Metric label="Conversion rate" value={s.conversion_rate} suffix="%" definition={metricDefinitions.conversion_rate} tone="good" />
          <Metric label="Outreach attempts" value={s.total_activities} definition={metricDefinitions.outreach_attempt} />
          <Metric label="Follow-ups due" value={s.follow_ups_due} definition={metricDefinitions.follow_up_due} />
          <Metric label="Overdue" value={s.follow_ups_overdue} tone="alert" definition={metricDefinitions.follow_up_overdue} />
          <Metric label="Gone quiet" value={s.stale_leads} tone="alert" definition={metricDefinitions.stale_lead} />
        </div>

        <div className="grid grid--2 mb">
          <div className="panel">
            <div className="panel__head">
              <h2>Sales funnel</h2>
              <span className="spacer" />
              <span className="muted small">counted as “reached this stage or beyond”</span>
            </div>
            <div className="panel__body">
              {data.funnel.total_leads === 0 ? (
                <Empty title="No leads in this selection" />
              ) : (
                <div className="funnel">
                  {data.funnel.stages.map((st) => (
                    <div className="funnel__row" key={st.code}>
                      <span className="funnel__label">{st.label}</span>
                      <div className="funnel__bar">
                        <div className="funnel__fill" style={{ width: `${Math.max(1, st.pct_of_total)}%` }}>
                          {st.count > 0 && st.count}
                        </div>
                      </div>
                      <span className="funnel__meta">
                        {st.pct_of_total}%
                        {st.drop_off > 0 && <span style={{ color: 'var(--danger)' }}> · −{st.drop_off}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <h2>Leads by</h2>
              <span className="spacer" />
              <select className="select" style={{ width: 'auto' }} value={field} onChange={(e) => setField(e.target.value)}>
                {BREAKDOWNS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            <div className="panel__body">
              {data.breakdown.data.length === 0 ? (
                <Empty title="Nothing to break down" />
              ) : (
                <div className="bars">
                  {data.breakdown.data.slice(0, 12).map((d) => (
                    <div className="bars__row" key={d.label}>
                      <span className="truncate" title={d.label}>{d.label}</span>
                      <div className="bars__bar">
                        <div className="bars__fill" style={{ width: `${(d.count / maxBreak) * 100}%` }} />
                      </div>
                      <span className="bars__n">
                        {d.count}
                        {d.converted > 0 && <span className="muted small"> · {d.conversion_rate}%</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <h2>Activity over time</h2>
            <span className="spacer" />
            <span className="muted small">every logged activity, by day</span>
          </div>
          <div className="panel__body">
            {data.trend.data.length === 0 ? (
              <Empty title="No activity logged in this range" />
            ) : (
              <>
                <div className="spark" role="img" aria-label={`Activity trend over ${data.trend.data.length} days`}>
                  {data.trend.data.map((d) => (
                    <div
                      key={d.day}
                      className="spark__bar"
                      style={{ height: `${(d.count / maxTrend) * 100}%` }}
                      title={`${d.day}: ${d.count} activities across ${d.leads_touched} leads`}
                    />
                  ))}
                </div>
                <div className="row small muted" style={{ marginTop: 6 }}>
                  <span>{data.trend.data[0]?.day}</span>
                  <span className="spacer" />
                  <span>peak {maxTrend}/day</span>
                  <span className="spacer" />
                  <span>{data.trend.data[data.trend.data.length - 1]?.day}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
