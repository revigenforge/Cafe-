/**
 * Creates the schema and installs the default reference data.
 *
 * Reference data (statuses, sources, priorities, activity types and
 * outcomes) is inserted only when its table is empty, so an admin's
 * later edits are never overwritten by re-running this.
 *
 * This is deliberately separate from seed.js: reference data is part
 * of a working install, demo leads are not.
 */
import db, { applySchema, DB_PATH } from './index.js';

const STATUSES = [
  // name,             color,     funnel_stage,  won, lost, default
  ['New',              'blue',    'NEW',           0, 0, 1],
  ['Contacted',        'cyan',    'CONTACTED',     0, 0, 0],
  ['Interested',       'violet',  'INTERESTED',    0, 0, 0],
  ['Follow-Up',        'amber',   'CONTACTED',     0, 0, 0],
  ['Meeting Booked',   'indigo',  'MEETING',       0, 0, 0],
  ['Proposal Sent',    'teal',    'PROPOSAL',      0, 0, 0],
  ['Negotiation',      'orange',  'NEGOTIATION',   0, 0, 0],
  ['Converted',        'green',   'CONVERTED',     1, 0, 0],
  ['Not Interested',   'rose',    null,            0, 1, 0],
  ['Not a Fit',        'rose',    null,            0, 1, 0],
  ['Lost',             'red',     null,            0, 1, 0],
  ['Wrong Number',     'slate',   null,            0, 1, 0],
];

const SOURCES = ['Claude', 'Manual', 'Website', 'Instagram', 'Referral', 'Google', 'CSV Import', 'Other'];

const PRIORITIES = [
  // name,    color,    weight, default
  ['Low',     'slate',   10, 0],
  ['Medium',  'blue',    20, 1],
  ['High',    'amber',   30, 0],
  ['Urgent',  'red',     40, 0],
];

const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Meeting', 'Follow-Up', 'Note', 'Other'];

const OUTCOMES = [
  // name,                  counts_as_contact
  ['No Answer',             0],
  ['Voicemail',             0],
  ['Connected',             1],
  ['Interested',            1],
  ['Follow-Up Required',    1],
  ['Meeting Booked',        1],
  ['Converted',             1],
  ['Not Interested',        1],
  ['Not a Fit',             1],
  ['Wrong Number',          0],
  ['Other',                 0],
];

function seedLookups() {
  const empty = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n === 0;

  if (empty('statuses')) {
    const ins = db.prepare(
      `INSERT INTO statuses (name, color, sort_order, funnel_stage, is_won, is_lost, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    STATUSES.forEach(([name, color, stage, won, lost, def], i) =>
      ins.run(name, color, (i + 1) * 10, stage, won, lost, def)
    );
  }

  if (empty('lead_sources')) {
    const ins = db.prepare('INSERT INTO lead_sources (name, sort_order) VALUES (?, ?)');
    SOURCES.forEach((name, i) => ins.run(name, (i + 1) * 10));
  }

  if (empty('priorities')) {
    const ins = db.prepare(
      'INSERT INTO priorities (name, color, weight, sort_order, is_default) VALUES (?, ?, ?, ?, ?)'
    );
    PRIORITIES.forEach(([name, color, weight, def], i) => ins.run(name, color, weight, (i + 1) * 10, def));
  }

  if (empty('activity_types')) {
    const ins = db.prepare('INSERT INTO activity_types (name, sort_order) VALUES (?, ?)');
    ACTIVITY_TYPES.forEach((name, i) => ins.run(name, (i + 1) * 10));
  }

  if (empty('activity_outcomes')) {
    const ins = db.prepare(
      'INSERT INTO activity_outcomes (name, sort_order, counts_as_contact) VALUES (?, ?, ?)'
    );
    OUTCOMES.forEach(([name, contact], i) => ins.run(name, (i + 1) * 10, contact));
  }
}

export function migrate({ quiet = false } = {}) {
  applySchema();
  db.transaction(seedLookups)();
  if (!quiet) {
    const counts = ['users', 'leads', 'statuses', 'lead_sources', 'priorities', 'activity_types', 'activity_outcomes']
      .map((t) => `${t}=${db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n}`)
      .join('  ');
    console.log(`database ready at ${DB_PATH}`);
    console.log(`  ${counts}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) migrate();
