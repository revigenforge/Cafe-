import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ── formatting ────────────────────────────────────────────── */

export const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function fmtDate(value, { withTime = false } = {}) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T') + (String(value).length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return String(value);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

/** "3 days ago" — the form people actually read on a feed. */
export function fmtRelative(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(value);
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(value);
}

export const fmtMoney = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ── badges ────────────────────────────────────────────────── */

export function Badge({ color = 'slate', children, dot = false }) {
  return (
    <span className="badge" data-c={color}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}

export function Owner({ name }) {
  if (!name) return <span className="owner owner--none">Unassigned</span>;
  return (
    <span className="owner">
      <span className="owner__av">{initials(name)}</span>
      {name}
    </span>
  );
}

/** A date, coloured by whether it has already passed. */
export function DueDate({ value, done = false }) {
  if (!value) return <span className="muted">—</span>;
  const day = String(value).slice(0, 10);
  const today = todayISO();
  const cls = done ? 'is-done' : day < today ? 'is-overdue' : day === today ? 'is-today' : 'is-future';
  const label = day === today ? 'Today' : fmtDate(value);
  return <span className={`pill ${cls}`}>{label}</span>;
}

/* ── toasts ────────────────────────────────────────────────── */

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = {
    toast: push,
    success: (t) => push(t, 'success'),
    error: (t) => push(t, 'error'),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'is-error' : t.kind === 'success' ? 'is-success' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx) ?? { toast: () => {}, success: () => {}, error: () => {} };

/* ── modal ─────────────────────────────────────────────────── */

export function Modal({ title, children, onClose, footer, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    /* Focus moves into the dialog so the keyboard stays inside it. */
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal__head">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Destructive actions route through here — nothing deletes on one click. */
export function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

/* ── states ────────────────────────────────────────────────── */

export function Loading({ rows = 5, label = 'Loading' }) {
  return (
    <div style={{ padding: 14 }} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 15, marginBottom: 9, width: `${95 - i * 7}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="errbox row">
      <span>{typeof error === 'string' ? error : error.message}</span>
      {onRetry && (
        <>
          <span className="spacer" />
          <button className="btn btn--sm" onClick={onRetry}>Try again</button>
        </>
      )}
    </div>
  );
}

/* ── form field ────────────────────────────────────────────── */

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

/** Select bound to a lookup table — never a hard-coded option list. */
export function LookupSelect({ value, onChange, options, placeholder = 'Any', allowEmpty = true, disabled, className = '' }) {
  return (
    <select
      className={`select ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.active === 0}>
          {o.name}{o.active === 0 ? ' (inactive)' : ''}
        </option>
      ))}
    </select>
  );
}

export function Pager({ page, totalPages, total, perPage, onPage, onPerPage }) {
  if (total === 0) return null;
  return (
    <div className="pager">
      <span className="muted small">
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()}
      </span>
      <span className="spacer" />
      {onPerPage && (
        <select className="select" style={{ width: 'auto', minHeight: 28 }} value={perPage} onChange={(e) => onPerPage(Number(e.target.value))}>
          {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
      )}
      <button className="btn btn--sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</button>
      <span className="small muted nowrap">Page {page} of {totalPages}</span>
      <button className="btn btn--sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next</button>
    </div>
  );
}

/** Copies text and reports it, so the click has visible feedback. */
export function useCopy() {
  const { success, error } = useToast();
  return useCallback(
    async (text, label = 'Copied') => {
      try {
        await navigator.clipboard.writeText(text);
        success(label);
      } catch {
        /* clipboard is blocked in some embedded views; fall back */
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          success(label);
        } catch {
          error('Could not copy — select the text manually');
        }
        ta.remove();
      }
    },
    [success, error]
  );
}
