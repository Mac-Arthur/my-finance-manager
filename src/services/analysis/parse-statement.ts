import Papa from 'papaparse';
import { AnalysisDraft, AnalysisRow } from '../../models/analysis';
import { CurrencyCode } from '../../models/finance';
import { CATEGORIES } from '../../data/categories';
import { inferStatementTable, mappedStatementTable, mappingRequest } from './adaptive-table';
import { ColumnMapping, MappingRequiredError } from './column-mapping';
export type { Field } from './statement-fields';
export { fieldFor, isIgnoredHeader, validHeaders } from './statement-fields';
import { Field, fieldFor, validHeaders } from './statement-fields';

/** Monetary values are validated and stored as integer minor units. No locale guessing. */
export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['GHS', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NGN', 'KES', 'ZAR'];

export function moneyMinor(raw: string): number {
  let value = raw.trim().replace(/^(?:GHS|USD|GBP|EUR|CAD|AUD|NGN|KES|ZAR|GH₵|[$€£₦])\s*/i, '');
  // Bank style suffixes: "120.00 DR" is money out, "120.00 CR" money in.
  const suffix = /^(.*?)\s*(CR|DR)$/i.exec(value);
  if (suffix) value = (suffix[2].toUpperCase() === 'DR' ? '-' : '') + suffix[1].replace(/^[+-]/, '');
  if (/^\(.*\)$/.test(value)) value = '-' + value.slice(1, -1);
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error(`Invalid money value: “${raw}”. Use 1234.56 format.`);
  const minor = Math.round(Number(value.replace(/,/g, '')) * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > 1e12) throw new Error('Amount is outside the supported range.');
  return minor;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** ISO, configured numeric order, or named-month dates ("12 JAN 26", "12-Jan-2026"). Rollovers are rejected. */
export function parseDate(raw: string, order: 'day-first' | 'month-first' = 'day-first'): string {
  const value = raw.trim().replace(/\s+/g, ' ');
  const time = '(?:[T ](\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?: ?([AP]M))?)?';
  const iso = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${time}$`, 'i').exec(value);
  const dayFirst = new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})${time}$`, 'i').exec(value);
  const named = new RegExp(`^(\\d{1,2})[ -]([A-Za-z]{3,9})\\.?[ ,-]*(\\d{4}|\\d{2})${time}$`, 'i').exec(value);
  const word = named?.[2].toLowerCase() ?? '';
  const monthIndex = word.length >= 3 ? MONTHS.findIndex(name => name.startsWith(word)) : -1;
  if (!iso && !dayFirst && monthIndex < 0) throw new Error(`Unsupported date: “${raw}”. Use YYYY-MM-DD, a supported numeric date, or 12 Jan 2026.`);
  const m = (iso ?? dayFirst ?? named)!;
  const y = named ? (named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3])) : Number(iso ? m[1] : m[3]);
  const numericMonth = order === 'month-first' ? Number(m[1]) : Number(m[2]);
  const numericDay = order === 'month-first' ? Number(m[2]) : Number(m[1]);
  const month = named ? monthIndex + 1 : iso ? Number(m[2]) : numericMonth;
  const day = named ? Number(m[1]) : iso ? Number(m[3]) : numericDay;
  let h = Number(m[4] || 0);
  const minute = Number(m[5] || 0), second = Number(m[6] || 0);
  if (m[7]) { if (h < 1 || h > 12) throw new Error(`Invalid time: “${raw}”.`); h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0); }
  const d = new Date(y, month - 1, day, h, minute, second);
  if (y < 2000 || y > 2100 || d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day || h > 23 || minute > 59 || second > 59) throw new Error(`Invalid calendar date: “${raw}”.`);
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

/** Details about the statement owner, used to spot transfers between their own accounts. */
export interface StatementMeta { owner?: string; account?: string; currency?: CurrencyCode; }

function detectCurrency(table: string[][], fields: (Field | undefined)[], text: string, meta: StatementMeta): CurrencyCode {
  const currencyColumn = fields.indexOf('currency');
  const declared = new Set<string>();
  if (currencyColumn >= 0) for (const row of table.slice(1)) {
    const value = (row[currencyColumn] ?? '').trim().toUpperCase();
    if (value) declared.add(value);
  }
  const moneyColumns = fields.map((field, index) => field && ['amount', 'debit', 'credit', 'fee', 'tax', 'balance'].includes(field) ? index : -1).filter(index => index >= 0);
  for (const row of table.slice(1)) for (const index of moneyColumns) {
    const marker = /^(GHS|USD|GBP|EUR|CAD|AUD|NGN|KES|ZAR|GH₵|[$€£₦])/i.exec((row[index] ?? '').trim())?.[1].toUpperCase();
    if (!marker) continue;
    declared.add(marker === 'GH₵' ? 'GHS' : marker === '$' ? 'USD' : marker === '€' ? 'EUR' : marker === '£' ? 'GBP' : marker === '₦' ? 'NGN' : marker);
  }
  if (meta.currency) declared.add(meta.currency);
  if (!declared.size) {
    declared.add('GHS');
  }
  const unsupported = [...declared].filter(code => !SUPPORTED_CURRENCIES.includes(code as CurrencyCode));
  if (unsupported.length) throw new Error(`Unsupported currency: ${unsupported.join(', ')}.`);
  if (declared.size !== 1) throw new Error('This file appears to mix currencies. Import one currency per account so totals stay accurate.');
  return [...declared][0] as CurrencyCode;
}

const words = (value: string) => value.toUpperCase().replace(/[^A-Z\s,-]/g, ' ').replace(/-/g, '').split(/[\s,]+/).filter(w => w.length > 2);
/** At least two of the owner's names (any order, hyphens ignored) means the counterparty is the owner. */
function mentionsOwner(text: string, owner?: string) {
  if (!owner) return false;
  const names = new Set(words(owner));
  if (names.size < 2) return false;
  return new Set(words(text).filter(w => names.has(w))).size >= Math.min(2, names.size);
}

const RULES: [RegExp, AnalysisRow['category']][] = [
  [/service charge|\bcharges?\b|\bcommission\b|\blevy\b|e-levy|maintenance fee|\bsms (fee|alert)|digital services|ledger fee|\bcot\b|\bstamp duty\b/i, 'charges'],
  [/\b(sportybet|betway|betting|bet9ja|msport|1xbet|soccarbet)\b/i, 'betting'],
  [/\b(airtime|bundle|data)\b|airtime\s*vendor/i, 'airtime'],
  [/\b(ecg|electricity|rent|water bill|dstv|gotv|bills\.inv|ghana water)\b/i, 'bills'],
  [/\b(uber|bolt|yango|taxi|trotro|fuel|ride|okada|motor|transport|fare)\b/i, 'transport'],
  [/\b(food|foodstuff|coffee|restaurant|lunch|breakfast|supper|dinner|groceries|waakye|fish|pie|drinks?|catering|fast food|chop|kenkey|jollof|starbites|tropiks)\b/i, 'food'],
  [/\b(hair|haircut|barber|salon|spa|nails?)\b/i, 'personal-care'],
  [/\b(offering|tithe|church|ministry|minstry|donation|gift|treat|funeral|wedding)\b/i, 'giving'],
  [/\b(melcom|mall|shop|shopping|pos|perfumery|instore|singlet|flowers|clothes|purchase|mastercard|visa)\b|pospurchase|pospayment|cardtrnx|card trnx|netflix|spotify|google|apple\.com|snapchat|jumia/i, 'shopping'],
  [/\bcash ?out\b|\batm\b|withdrawal/i, 'cash-out'],
];

/** Rule-based suggestions only. Order matters: loans and own-account moves win over keywords. */
export function categoryFor(name: string, detail: string, amount: number, owner?: string): AnalysisRow['category'] {
  const text = `${name} ${detail}`;
  if (/\b(loan|qwikloan|fido|bosea)\b/i.test(text)) return amount > 0 ? 'loan' : 'loan-repayment';
  if (mentionsOwner(text, owner)) return amount > 0 ? 'from-bank' : 'own-accounts';
  if (amount > 0) return 'received';
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? 'transfers';
}

export function rowsToDraft(table: string[][], text: string, meta: StatementMeta = {}): AnalysisDraft {
  const fields = table[0]?.map(fieldFor) ?? [];
  if (!validHeaders(fields)) throw new Error('Could not recognise the transaction columns. Use a CSV with date, name and signed amount, or debit and credit columns. No transactions were imported.');
  const present = fields.filter(Boolean);
  if (new Set(present).size !== present.length) throw new Error('Ambiguous duplicate column headers. Give each column a unique name.');
  const currency = detectCurrency(table, fields, text, meta);
  const dateOrder = currency === 'USD' ? 'month-first' : 'day-first';
  const warnings = ['Local analysis: categories are suggestions, not AI conclusions. Check every row against your statement.', 'Coverage is based on transaction dates, not a verified full statement period. Comparisons and averages may be incomplete.'];
  if (fields.includes('tax')) warnings.push('The fees total includes any separately listed transaction tax.');
  if (!fields.includes('fee')) warnings.push('No fee column was found. Fees default to zero; verify before confirming.');
  if (!fields.includes('balance')) warnings.push('No running balance was found. A current balance will not be inferred.');
  if (table.slice(1).some(row => /^\d{1,2}[/-]\d{1,2}[/-]/.test(row[fields.indexOf('date')] || ''))) warnings.push(`Numeric dates are interpreted as ${dateOrder === 'month-first' ? 'month/day/year for USD' : 'day/month/year'}.`);
  if (!fields.includes('currency') && !meta.currency && currency === 'GHS' && !/\bGHS\b|GH₵/i.test(text)) warnings.push('No currency label was found, so this import defaults to GHS. Confirm the account currency before importing.');
  const rows = table.slice(1).filter(row => row.some(c => c.trim())).map((cells, index): AnalysisRow => {
    const get = (field: Field) => (cells[fields.indexOf(field)] ?? '').trim();
    try {
      if (cells.length !== fields.length) throw new Error('Column count does not match the header.');
      let amount: number;
      if (fields.includes('amount')) amount = moneyMinor(get('amount'));
      else {
        const debit = get('debit') && get('debit') !== '-' ? moneyMinor(get('debit')) : 0;
        const credit = get('credit') && get('credit') !== '-' ? moneyMinor(get('credit')) : 0;
        if (debit < 0 || credit < 0 || (debit && credit)) throw new Error('Debit/credit must be non-negative with only one side filled.');
        amount = credit - debit;
      }
      if (amount === 0) throw new Error('Zero-value transaction needs manual review in the source file.');
      // Banks sometimes print no narrative (e.g. month-end interest). Keep the row; its reference stays alongside.
      const name = get('name') || get('type') || (get('reference') || get('id') ? (amount > 0 ? 'Bank credit' : 'Bank debit') : '');
      if (!name) throw new Error('Missing transaction description.');
      const baseFee = get('fee') && get('fee') !== '-' ? moneyMinor(get('fee')) : 0;
      const tax = get('tax') && get('tax') !== '-' ? moneyMinor(get('tax')) : 0;
      if (baseFee < 0 || tax < 0) throw new Error('Fees and tax must not be negative.');
      const fee = baseFee + tax;
      if (fee < 0) throw new Error('Fee must not be negative.');
      return { sourceRow: index + 2, providerId: get('id'), date: parseDate([get('date'), get('time')].filter(Boolean).join(' '), dateOrder), name,
        amountMinor: amount, feeMinor: fee, balanceMinor: get('balance') && get('balance') !== '-' ? moneyMinor(get('balance')) : null,
        reference: get('reference'), category: categoryFor(name, [get('type'), get('reference')].join(' '), amount, meta.owner) };
    } catch (error) { throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid row'}`); }
  });
  const balanceCheck = checkBalances(rows);
  if (balanceCheck) warnings.push(balanceCheck.breaks
    ? `${balanceCheck.breaks} of ${balanceCheck.checked + 1} rows don't follow the running balance. This can be a provider quirk (such as airtime on credit) or a misread row: compare them with the original.`
    : `Running balance verified across all ${balanceCheck.checked + 1} transactions.`);
  const draft: AnalysisDraft = { version: 1, mode: 'local', account: meta.account ?? '', currency, rows, warnings, extractedText: text, balanceCheck };
  validateDraft(draft, false);
  return draft;
}

/**
 * The statement's own running balance is the strongest proof the rows were read correctly:
 * each balance must equal its neighbour's plus the amount, minus fees. Works oldest-first or newest-first.
 */
export function checkBalances(rows: AnalysisRow[]): AnalysisDraft['balanceCheck'] {
  let checked = 0, forward = 0, backward = 0;
  for (let i = 1; i < rows.length; i++) {
    const [prev, cur] = [rows[i - 1], rows[i]];
    if (prev.balanceMinor === null || cur.balanceMinor === null) continue;
    checked++;
    if (Math.abs(prev.balanceMinor + cur.amountMinor - cur.feeMinor - cur.balanceMinor) <= 1) forward++;
    if (Math.abs(cur.balanceMinor + prev.amountMinor - prev.feeMinor - prev.balanceMinor) <= 1) backward++;
  }
  return checked ? { checked, breaks: checked - Math.max(forward, backward) } : undefined;
}

export function parseCsv(text: string, mapping?: ColumnMapping): AnalysisDraft {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(`CSV could not be read: ${result.errors[0].message}`);
  if (mapping) {
    if (mapping.source !== 'csv') throw new Error('This column mapping belongs to a different file type.');
    const table = mappedStatementTable(result.data, mapping, dateWorks);
    const draft = rowsToDraft(table, text);
    draft.warnings.push('Columns were mapped manually. Compare the preview with the original before confirming.');
    return draft;
  }
  let inferred: ReturnType<typeof inferTable>;
  try { inferred = inferTable(result.data); }
  catch (error) {
    const request = mappingRequest(result.data, 'csv');
    if (request && error instanceof Error && /identify|interpretations/i.test(error.message)) throw new MappingRequiredError(request);
    throw error;
  }
  const draft = rowsToDraft(inferred.table, text);
  addInferenceWarning(draft, inferred);
  return draft;
}

export function dateWorks(value: string) {
  try { parseDate(value, 'day-first'); return true; }
  catch { try { parseDate(value, 'month-first'); return true; } catch { return false; } }
}

export function inferTable(rows: string[][]) {
  const moneyWorks = (value: string) => { try { moneyMinor(value); return true; } catch { return false; } };
  return inferStatementTable(rows, dateWorks, moneyWorks);
}

export function addInferenceWarning(draft: AnalysisDraft, inferred: ReturnType<typeof inferTable>) {
  if (inferred.headerIndex || inferred.headerDepth === 2) draft.warnings.push(`The transaction table starts at row ${inferred.headerIndex + 1}${inferred.headerDepth === 2 ? ' and uses a two-line heading' : ''}. Earlier title rows were ignored.`);
  if (inferred.inferred.length) draft.warnings.push(`Adaptive column detection inferred ${inferred.inferred.map(item => `“${item.column}” as ${item.field}`).join(', ')} from the column values. Verify these columns in the preview.`);
}

export function validateDraft(draft: AnalysisDraft, requireAccount = true) {
  if (!SUPPORTED_CURRENCIES.includes(draft.currency) || draft.mode !== 'local' || draft.version !== 1) throw new Error('Unsupported analysis format.');
  if (requireAccount && (!draft.account.trim() || draft.account.trim().length > 80)) throw new Error('Enter an account label, such as “My MTN wallet”. Use the same label for future statements from this account.');
  if (!draft.rows.length || draft.rows.length > 10000) throw new Error('A statement must contain between 1 and 10,000 transactions.');
  const ids = new Set<string>();
  for (const row of draft.rows) {
    parseDate(row.date);
    if (!row.name.trim() || !CATEGORIES[row.category]) throw new Error('A transaction has an invalid description or category.');
    for (const value of [row.amountMinor, row.feeMinor, ...(row.balanceMinor === null ? [] : [row.balanceMinor])]) {
      if (!Number.isSafeInteger(value) || Math.abs(value) > 1e12) throw new Error('Invalid monetary amount.');
    }
    if (row.amountMinor === 0 || row.feeMinor < 0) throw new Error('Invalid transaction amount or fee.');
    if (row.providerId && ids.has(row.providerId)) throw new Error('Repeated transaction IDs in this file need review before importing.');
    if (row.providerId) ids.add(row.providerId);
  }
  const dates = draft.rows.map(row => +new Date(row.date));
  if (Math.max(...dates) - Math.min(...dates) > 366 * 86400000 * 3) throw new Error('Split statements longer than three years into smaller files.');
}
