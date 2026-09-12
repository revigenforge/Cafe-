import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';

/**
 * Search across leads, tasks and people. Phone numbers are normalised
 * server-side, so any way of typing a number finds the same lead.
 * Cmd/Ctrl-K focuses it from anywhere.
 */
export default function GlobalSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return undefined;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        setRes(await api.search.query(q.trim()));
        setOpen(true);
      } catch {
        setRes(null);
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path) => {
    setOpen(false);
    setQ('');
    onPick(path);
  };

  const nothing = res && !res.leads.length && !res.tasks.length && !res.users.length;

  return (
    <div className="gsearch" ref={boxRef}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res && setOpen(true)}
        placeholder="Search leads, tasks, people…   ⌘K"
        aria-label="Search"
      />

      {open && res && (
        <div className="gsearch__results">
          {busy && <div className="gsearch__label">Searching…</div>}

          {nothing && (
            <div style={{ padding: '14px 12px' }} className="muted small">
              Nothing matched “{res.query}”.
              {res.normalized_phone && <> Tried the phone number as <code>{res.normalized_phone}</code>.</>}
            </div>
          )}

          {res.leads.length > 0 && (
            <div className="gsearch__group">
              <div className="gsearch__label">Leads</div>
              {res.leads.map((l) => (
                <button key={l.id} className="gsearch__item" onClick={() => go(`/leads/${l.id}`)}>
                  <strong>{l.business_name}</strong>
                  <span>
                    {[l.contact_name, l.phone, l.city].filter(Boolean).join(' · ')}
                    {l.owner_name ? ` — ${l.owner_name}` : ' — unassigned'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {res.tasks.length > 0 && (
            <div className="gsearch__group">
              <div className="gsearch__label">Tasks</div>
              {res.tasks.map((t) => (
                <button key={t.id} className="gsearch__item" onClick={() => go(t.lead_id ? `/leads/${t.lead_id}` : '/tasks')}>
                  <strong>{t.title}</strong>
                  <span>{t.status} · {t.priority}{t.assigned_to_name ? ` · ${t.assigned_to_name}` : ''}</span>
                </button>
              ))}
            </div>
          )}

          {res.users.length > 0 && (
            <div className="gsearch__group">
              <div className="gsearch__label">People</div>
              {res.users.map((u) => (
                <button key={u.id} className="gsearch__item" onClick={() => go(`/leads?owner_id=${u.id}`)}>
                  <strong>{u.name}</strong>
                  <span>{u.role} · see their leads</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
