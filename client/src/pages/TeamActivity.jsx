import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Badge, Empty, ErrorBox, Loading, fmtRelative, initials } from '../components/ui.jsx';

/** One sentence describing what actually happened, per feed entry. */
function describe(item) {
  if (item.kind === 'activity') {
    return (
      <>
        logged a <Badge color="blue">{item.activity_type_name ?? 'activity'}</Badge>
        {item.outcome_name && <> — <Badge color="slate">{item.outcome_name}</Badge></>} on{' '}
        <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link>
      </>
    );
  }
  if (item.kind === 'task_completed') {
    return (
      <>
        completed <strong>{item.title}</strong>
        {item.business_name && <> on <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link></>}
      </>
    );
  }
  const verbs = {
    created: <>added <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link></>,
    imported: <>imported <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link></>,
    assigned: (
      <>
        {item.to_value ? <>assigned <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link> to <strong>{item.to_value}</strong></>
          : <>unassigned <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link></>}
      </>
    ),
    status_changed: (
      <>
        moved <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link> from{' '}
        <strong>{item.from_value ?? '—'}</strong> → <strong>{item.to_value}</strong>
      </>
    ),
    priority_changed: (
      <>set <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link> priority to <strong>{item.to_value ?? 'none'}</strong></>
    ),
  };
  return verbs[item.event_type] ?? <>{item.event_type} on <Link to={`/leads/${item.lead_id}`}>{item.business_name}</Link></>;
}

export default function TeamActivity() {
  const { users } = useApp();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(60);
  const [person, setPerson] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.activities.feed({ limit });
      setFeed(r.data);
    } catch (err) {
      setError(err.message);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={load} /></div>;
  if (!feed) return <div className="page"><Loading rows={9} /></div>;

  const shown = person ? feed.filter((f) => f.user_name === person) : feed;

  // group by day so a long feed stays readable
  const groups = [];
  for (const item of shown) {
    const day = String(item.created_at).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  const dayLabel = (d) => {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === today) return 'Today';
    if (d === yest) return 'Yesterday';
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  return (
    <>
      <header className="topbar" style={{ borderTop: 0 }}>
        <div>
          <h1>Team activity</h1>
          <div className="topbar__sub">What everyone has actually been doing</div>
        </div>
        <span className="topbar__spacer" />
        <select className="select" style={{ width: 'auto' }} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>
      </header>

      <div className="page">
        <div className="panel">
          <div className="panel__body">
            {shown.length === 0 ? (
              <Empty title="Nothing here yet">
                Activities, status changes and completed tasks all appear in this feed.
              </Empty>
            ) : (
              groups.map((g) => (
                <section key={g.day} style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)', margin: '0 0 9px' }}>
                    {dayLabel(g.day)}
                  </h3>
                  <div className="timeline">
                    {g.items.map((item) => (
                      <div className="tl-item" data-kind={item.kind} key={`${item.kind}-${item.id}`}>
                        <div className="tl-head">
                          <span className="owner">
                            <span className="owner__av">{initials(item.user_name)}</span>
                            <strong>{item.user_name ?? 'Someone'}</strong>
                          </span>
                          <span>{describe(item)}</span>
                          <span className="tl-when">{fmtRelative(item.created_at)}</span>
                        </div>
                        {item.notes && <div className="tl-body small">{item.notes}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          {shown.length >= limit && (
            <div className="pager">
              <span className="spacer" />
              <button className="btn btn--sm" onClick={() => setLimit((l) => l + 60)}>Load more</button>
              <span className="spacer" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
