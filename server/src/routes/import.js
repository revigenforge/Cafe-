import { Router } from 'express';
import multer from 'multer';
import db from '../db/index.js';
import { handle, badRequest } from '../middleware/errors.js';
import { requireRole } from '../middleware/auth.js';
import { refId, int } from '../middleware/validate.js';
import { normalizePhone } from '../lib/phone.js';
import { parseCsv, guessMapping, IMPORTABLE_FIELDS } from '../lib/csv.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Two-step import. `analyze` reads the file and reports what it found
 * without writing anything; `commit` performs the insert using a
 * mapping the user has confirmed. Nothing is written on the first step,
 * so a bad mapping costs nothing.
 */

router.get(
  '/fields',
  handle((req, res) => res.json({ fields: IMPORTABLE_FIELDS }))
);

router.post(
  '/analyze',
  requireRole('ADMIN', 'MANAGER'),
  upload.single('file'),
  handle((req, res) => {
    const text = req.file ? req.file.buffer.toString('utf8') : String(req.body.csv || '');
    if (!text.trim()) throw badRequest('No CSV content received');

    const rows = parseCsv(text);
    if (rows.length < 2) throw badRequest('The file needs a header row and at least one data row');

    const headers = rows[0].map((h) => String(h).trim());
    const mapping = guessMapping(headers);

    res.json({
      headers,
      suggested_mapping: mapping,
      importable_fields: IMPORTABLE_FIELDS,
      total_rows: rows.length - 1,
      preview: rows.slice(1, 11),
    });
  })
);

router.post(
  '/commit',
  requireRole('ADMIN', 'MANAGER'),
  upload.single('file'),
  handle((req, res) => {
    const text = req.file ? req.file.buffer.toString('utf8') : String(req.body.csv || '');
    if (!text.trim()) throw badRequest('No CSV content received');

    let mapping = req.body.mapping;
    if (typeof mapping === 'string') {
      try {
        mapping = JSON.parse(mapping);
      } catch {
        throw badRequest('mapping must be valid JSON');
      }
    }
    if (!mapping || typeof mapping !== 'object') throw badRequest('mapping is required');

    const fields = Object.values(mapping);
    if (!fields.includes('business_name')) {
      throw badRequest('business_name must be mapped — a lead needs a name');
    }
    for (const f of fields) {
      if (f && !IMPORTABLE_FIELDS.includes(f)) throw badRequest(`Unknown field in mapping: ${f}`);
    }

    const ownerId = req.body.owner_id ? refId(db, 'users', req.body.owner_id, 'owner_id') : null;
    const sourceId = req.body.source_id ? refId(db, 'lead_sources', req.body.source_id, 'source_id') : null;
    const skipDuplicates = String(req.body.skip_duplicates ?? 'true') !== 'false';

    const defaultStatus =
      db.prepare('SELECT id FROM statuses WHERE is_default = 1 LIMIT 1').get() ||
      db.prepare('SELECT id FROM statuses WHERE active = 1 ORDER BY sort_order LIMIT 1').get();
    const defaultPriority = db.prepare('SELECT id FROM priorities WHERE is_default = 1 LIMIT 1').get();
    const csvSource =
      sourceId ??
      db.prepare("SELECT id FROM lead_sources WHERE name = 'CSV Import' LIMIT 1").get()?.id ??
      null;

    const rows = parseCsv(text);
    const dataRows = rows.slice(1);

    const result = { imported: 0, duplicates: 0, invalid: 0, skipped: 0, errors: [], imported_ids: [] };

    /* Duplicates are checked against the database *and* against rows
       already seen in this same file, so a CSV that repeats a number
       does not create two leads. */
    const seenPhones = new Set();
    const seenEmails = new Set();
    const findByPhone = db.prepare('SELECT id, business_name FROM leads WHERE normalized_phone = ?');
    const findByEmail = db.prepare('SELECT id, business_name FROM leads WHERE lower(email) = lower(?)');

    const insert = db.prepare(
      `INSERT INTO leads
         (business_name, contact_name, phone, normalized_phone, email, website, address,
          city, state, country, industry, niche, notes, estimated_value,
          source_id, status_id, priority_id, owner_id)
       VALUES
         (@business_name, @contact_name, @phone, @normalized_phone, @email, @website, @address,
          @city, @state, @country, @industry, @niche, @notes, @estimated_value,
          @source_id, @status_id, @priority_id, @owner_id)`
    );
    const logEvent = db.prepare(
      `INSERT INTO lead_events (lead_id, user_id, event_type, to_value)
       VALUES (?, ?, 'imported', ?)`
    );

    db.transaction(() => {
      dataRows.forEach((cells, idx) => {
        const line = idx + 2; // 1-based, plus the header

        const rec = {};
        for (const [colIdx, field] of Object.entries(mapping)) {
          if (!field) continue;
          const v = cells[Number(colIdx)];
          if (v != null && String(v).trim() !== '') rec[field] = String(v).trim();
        }

        if (!rec.business_name) {
          result.invalid++;
          result.errors.push({ line, reason: 'Missing business name' });
          return;
        }

        const phone = normalizePhone(rec.phone);
        const mail = rec.email ? rec.email.toLowerCase() : null;

        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
          result.invalid++;
          result.errors.push({ line, reason: `Invalid email: ${rec.email}`, business: rec.business_name });
          return;
        }

        if (phone && (seenPhones.has(phone) || findByPhone.get(phone))) {
          result.duplicates++;
          if (skipDuplicates) {
            result.errors.push({ line, reason: 'Duplicate phone', business: rec.business_name });
            return;
          }
        }
        if (mail && (seenEmails.has(mail) || findByEmail.get(mail))) {
          result.duplicates++;
          if (skipDuplicates) {
            result.errors.push({ line, reason: 'Duplicate email', business: rec.business_name });
            return;
          }
        }

        // a source named in the file wins over the one chosen in the form
        let rowSource = csvSource;
        if (rec.source) {
          const found = db
            .prepare('SELECT id FROM lead_sources WHERE name = ? COLLATE NOCASE')
            .get(rec.source);
          if (found) rowSource = found.id;
        }

        const value = rec.estimated_value != null ? Number(String(rec.estimated_value).replace(/[^\d.]/g, '')) : null;

        try {
          const info = insert.run({
            business_name: rec.business_name.slice(0, 200),
            contact_name: rec.contact_name?.slice(0, 200) ?? null,
            phone: rec.phone?.slice(0, 40) ?? null,
            normalized_phone: phone,
            email: mail,
            website: rec.website?.slice(0, 300) ?? null,
            address: rec.address?.slice(0, 500) ?? null,
            city: rec.city?.slice(0, 120) ?? null,
            state: rec.state?.slice(0, 120) ?? null,
            country: rec.country?.slice(0, 120) ?? null,
            industry: rec.industry?.slice(0, 120) ?? null,
            niche: rec.niche?.slice(0, 120) ?? null,
            notes: rec.notes?.slice(0, 20000) ?? null,
            estimated_value: Number.isFinite(value) ? value : null,
            source_id: rowSource,
            status_id: defaultStatus.id,
            priority_id: defaultPriority?.id ?? null,
            owner_id: ownerId,
          });

          logEvent.run(info.lastInsertRowid, req.user.id, rec.business_name);

          if (phone) seenPhones.add(phone);
          if (mail) seenEmails.add(mail);
          result.imported++;
          result.imported_ids.push(info.lastInsertRowid);
        } catch (err) {
          result.invalid++;
          result.errors.push({ line, reason: err.message.slice(0, 200), business: rec.business_name });
        }
      });
    })();

    result.skipped = result.invalid + (skipDuplicates ? result.duplicates : 0);
    result.total_rows = dataRows.length;
    result.errors = result.errors.slice(0, 200);

    res.json(result);
  })
);

export default router;
