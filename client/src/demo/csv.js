/**
 * A small RFC-4180 CSV reader. Written rather than pulled in because
 * the import path must handle quoted commas, embedded newlines and
 * BOMs predictably, and a dependency would hide that behaviour.
 */

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // handled by the \n that follows
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/** Column headings we recognise without being told, lowercased. */
const ALIASES = {
  business_name: ['business name', 'business', 'company', 'company name', 'name', 'organisation', 'organization', 'firm', 'shop'],
  contact_name: ['contact name', 'contact', 'person', 'contact person', 'owner name', 'full name', 'first name'],
  phone: ['phone', 'mobile', 'phone number', 'mobile number', 'contact number', 'telephone', 'tel', 'whatsapp', 'number'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  website: ['website', 'url', 'web', 'site', 'web address', 'domain'],
  address: ['address', 'street', 'street address', 'full address', 'location'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  country: ['country'],
  industry: ['industry', 'category', 'business type', 'type', 'sector'],
  niche: ['niche', 'sub category', 'subcategory', 'speciality', 'specialty', 'segment'],
  source: ['source', 'lead source', 'origin', 'channel'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'description'],
  estimated_value: ['estimated value', 'value', 'deal value', 'budget', 'amount'],
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** Best-guess mapping from CSV headings to lead fields. */
export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();

  headers.forEach((h, i) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.includes(key)) {
        mapping[i] = field;
        used.add(field);
        return;
      }
    }
  });

  // second pass: partial matches for anything still unmapped
  headers.forEach((h, i) => {
    if (mapping[i]) return;
    const key = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.some((a) => key.includes(a) || a.includes(key))) {
        mapping[i] = field;
        used.add(field);
        return;
      }
    }
  });

  return mapping;
}

export const IMPORTABLE_FIELDS = Object.keys(ALIASES);
