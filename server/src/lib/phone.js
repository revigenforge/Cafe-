/**
 * Phone normalisation, used for duplicate detection on import and for
 * search. One function, so a number typed as "+91 98765 43210",
 * "098765 43210" and "9876543210" all collapse to the same key.
 *
 * Default country is India; override with CRM_DEFAULT_COUNTRY_CODE.
 */

const DEFAULT_CC = process.env.CRM_DEFAULT_COUNTRY_CODE || '91';

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} digits-only national number, or null if unusable
 */
export function normalizePhone(raw) {
  if (raw == null) return null;

  let s = String(raw).trim();
  if (!s) return null;

  const hadPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;

  // 00 international prefix behaves like a leading +
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);

  // strip the default country code, whether or not a + was typed
  if (digits.length > 10 && digits.startsWith(DEFAULT_CC)) {
    const rest = digits.slice(DEFAULT_CC.length);
    if (rest.length >= 10) digits = rest;
  }

  // domestic trunk prefix
  while (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // too short to identify anyone
  if (digits.length < 7) return null;

  // keep the last 10 for long numbers we could not confidently split
  if (digits.length > 12) digits = digits.slice(-10);

  return digits;
}

/** Display form for an Indian 10-digit number; otherwise returned unchanged. */
export function formatPhone(raw) {
  const n = normalizePhone(raw);
  if (!n) return raw || '';
  if (n.length === 10) return `${n.slice(0, 5)} ${n.slice(5)}`;
  return n;
}
