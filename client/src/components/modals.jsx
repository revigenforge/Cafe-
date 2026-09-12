import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { Modal, Field, LookupSelect, useToast, todayISO, ErrorBox } from './ui.jsx';

/* ── log an activity ───────────────────────────────────────── */

/**
 * Records what the salesperson already did elsewhere, and — in the same
 * submit — can move the status and set the next follow-up. Doing all
 * three at once is what keeps working the queue to one dialog per lead.
 */
export function LogActivityModal({ lead, onClose, onSaved }) {
  const { activityTypes, outcomes, activeStatuses } = useApp();
  const { success, error: toastError } = useToast();

  const [typeId, setTypeId] = useState(activityTypes.find((t) => t.name === 'Call')?.id ?? activityTypes[0]?.id ?? null);
  const [outcomeId, setOutcomeId] = useState(null);
  const [statusId, setStatusId] = useState(lead?.status_id ?? null);
  const [followUp, setFollowUp] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!typeId) return setErr('Pick what you did');
    setBusy(true);
    try {
      await api.activities.create({
        lead_id: lead.id,
        activity_type_id: typeId,
        outcome_id: outcomeId,
        notes: notes.trim() || null,
        duration_minutes: duration === '' ? null : Number(duration),
        follow_up_date: followUp || null,
        status_id: statusId !== lead.status_id ? statusId : null,
      });
      success('Activity logged');
      onSaved?.();
      onClose();
    } catch (e2) {
      setErr(e2.message);
      toastError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Log activity — ${lead.business_name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy} form="logact">
            {busy && <span className="spinner" />} Save activity
          </button>
        </>
      }
    >
      <form id="logact" onSubmit={submit}>
        {err && <div className="mb"><ErrorBox error={err} /></div>}

        <p className="small muted" style={{ marginTop: 0 }}>
          The CRM does not place the call or send the message — log here what you already did.
        </p>

        <div className="formgrid">
          <Field label="What did you do?">
            <LookupSelect value={typeId} onChange={setTypeId} options={activityTypes.filter((t) => t.active)} allowEmpty={false} />
          </Field>

          <Field label="What happened?">
            <LookupSelect value={outcomeId} onChange={setOutcomeId} options={outcomes.filter((o) => o.active)} placeholder="No outcome yet" />
          </Field>

          <Field label="Move status to" hint={statusId !== lead.status_id ? 'The lead will move stage' : undefined}>
            <LookupSelect value={statusId} onChange={setStatusId} options={activeStatuses} allowEmpty={false} />
          </Field>

          <Field label="Next follow-up">
            <input className="input" type="date" min={todayISO()} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </Field>

          <Field label="Minutes (optional)">
            <input className="input" type="number" min="0" max="1440" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" />
          </Field>

          <Field label="Notes" className="full">
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was said, what happens next…" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── create or edit a task ─────────────────────────────────── */

export function TaskModal({ task, lead, onClose, onSaved }) {
  const { users, taskPriorities, taskStatuses, canSeeTeam, user } = useApp();
  const { success } = useToast();
  const editing = Boolean(task?.id);

  const [form, setForm] = useState({
    title: task?.title ?? (lead ? `Follow up with ${lead.business_name}` : ''),
    description: task?.description ?? '',
    assigned_to: task?.assigned_to ?? user?.id ?? null,
    lead_id: task?.lead_id ?? lead?.id ?? null,
    due_date: task?.due_date?.slice(0, 10) ?? todayISO(),
    priority: task?.priority ?? 'Medium',
    status: task?.status ?? 'To Do',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) return setErr('Give the task a title');
    setBusy(true);
    try {
      const body = { ...form, title: form.title.trim(), description: form.description.trim() || null };
      if (editing) await api.tasks.update(task.id, body);
      else await api.tasks.create(body);
      success(editing ? 'Task updated' : 'Task created');
      onSaved?.();
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />} {editing ? 'Save task' : 'Create task'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {err && <div className="mb"><ErrorBox error={err} /></div>}
        <div className="formgrid">
          <Field label="Title" className="full">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Send proposal to Iron Forge Gym" />
          </Field>

          <Field label="Assigned to" hint={!canSeeTeam ? 'You can only assign tasks to yourself' : undefined}>
            <select className="select" value={form.assigned_to ?? ''} onChange={(e) => set('assigned_to', Number(e.target.value))} disabled={!canSeeTeam}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>

          <Field label="Due">
            <input className="input" type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
          </Field>

          <Field label="Priority">
            <select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {taskPriorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          {editing && (
            <Field label="Status">
              <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {taskStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}

          <Field label="Notes" className="full">
            <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        {lead && <p className="small muted">Linked to {lead.business_name}</p>}
      </form>
    </Modal>
  );
}

/* ── create or edit a lead ─────────────────────────────────── */

export function LeadModal({ lead, onClose, onSaved }) {
  const { activeStatuses, priorities, sources, users, canAssign, user } = useApp();
  const { success } = useToast();
  const editing = Boolean(lead?.id);

  const [form, setForm] = useState({
    business_name: lead?.business_name ?? '',
    contact_name: lead?.contact_name ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    website: lead?.website ?? '',
    address: lead?.address ?? '',
    city: lead?.city ?? '',
    state: lead?.state ?? '',
    country: lead?.country ?? 'India',
    industry: lead?.industry ?? '',
    niche: lead?.niche ?? '',
    estimated_value: lead?.estimated_value ?? '',
    notes: lead?.notes ?? '',
    status_id: lead?.status_id ?? activeStatuses.find((s) => s.is_default)?.id ?? activeStatuses[0]?.id ?? null,
    priority_id: lead?.priority_id ?? priorities.find((p) => p.is_default)?.id ?? null,
    source_id: lead?.source_id ?? null,
    owner_id: lead?.owner_id ?? (canAssign ? null : user?.id ?? null),
    next_follow_up_at: lead?.next_follow_up_at?.slice(0, 10) ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [dupes, setDupes] = useState([]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* Warn about an existing lead before a duplicate is created, rather
     than discovering it later in the book. */
  useEffect(() => {
    if (editing) return undefined;
    const phone = form.phone.trim();
    const mail = form.email.trim();
    if (phone.length < 6 && !mail) {
      setDupes([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.search.duplicates({ phone, email: mail });
        setDupes(r.matches ?? []);
      } catch {
        setDupes([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.phone, form.email, editing]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!form.business_name.trim()) return setErr('A lead needs a business name');
    setBusy(true);
    try {
      const body = {
        ...form,
        business_name: form.business_name.trim(),
        estimated_value: form.estimated_value === '' ? null : Number(form.estimated_value),
        next_follow_up_at: form.next_follow_up_at || null,
      };
      const saved = editing ? await api.leads.update(lead.id, body) : await api.leads.create(body);
      success(editing ? 'Lead updated' : 'Lead created');
      onSaved?.(saved);
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={editing ? `Edit ${lead.business_name}` : 'New lead'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />} {editing ? 'Save lead' : 'Create lead'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {err && <div className="mb"><ErrorBox error={err} /></div>}

        {dupes.length > 0 && (
          <div className="warnbox mb">
            <strong>Possible duplicate.</strong>{' '}
            {dupes.map((d) => d.business_name).join(', ')} already {dupes.length === 1 ? 'has' : 'have'} this
            phone or email. You can still save, but check first.
          </div>
        )}

        <div className="formgrid">
          <Field label="Business name" className="span2">
            <input className="input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} autoFocus />
          </Field>
          <Field label="Contact name">
            <input className="input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Website">
            <input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </Field>

          <Field label="Industry">
            <input className="input" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
          </Field>
          <Field label="Niche">
            <input className="input" value={form.niche} onChange={(e) => set('niche', e.target.value)} />
          </Field>
          <Field label="City">
            <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="Country">
            <input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} />
          </Field>

          <Field label="Status">
            <LookupSelect value={form.status_id} onChange={(v) => set('status_id', v)} options={activeStatuses} allowEmpty={false} />
          </Field>
          <Field label="Priority">
            <LookupSelect value={form.priority_id} onChange={(v) => set('priority_id', v)} options={priorities.filter((p) => p.active)} placeholder="None" />
          </Field>
          <Field label="Source">
            <LookupSelect value={form.source_id} onChange={(v) => set('source_id', v)} options={sources.filter((s) => s.active)} placeholder="Unknown" />
          </Field>
          <Field label="Owner" hint={!canAssign ? 'Leads you create are yours' : undefined}>
            <select className="select" value={form.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value === '' ? null : Number(e.target.value))} disabled={!canAssign}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Estimated value">
            <input className="input" type="number" min="0" value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value)} placeholder="₹" />
          </Field>
          <Field label="Next follow-up">
            <input className="input" type="date" value={form.next_follow_up_at} onChange={(e) => set('next_follow_up_at', e.target.value)} />
          </Field>

          <Field label="Address" className="full">
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Notes" className="full">
            <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
