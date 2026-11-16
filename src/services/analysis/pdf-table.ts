import { momoPdfTable } from './momo-pdf';
import { officialMomoPdfTable } from './official-momo-pdf';
import { StatementMeta, parseDate } from './parse-statement';
import { Field, fieldFor, isIgnoredHeader, validHeaders } from './statement-fields';

/** One run of text from pdf.js. `w`/`h` are width and font height when known. */
export interface PdfCell { text: string; x: number; y: number; w?: number; h?: number; }
interface Column { field?: Field; x: number; right: number; }
type Line = PdfCell[];

const MONEY = /^\(?[+-]?(?:(?:GHS|USD|GBP|EUR|CAD|AUD|NGN|KES|ZAR|GH₵|[$€£₦])\s?)?\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})?\)?(?:\s?(?:CR|DR))?$/i;
const MONEY_FIELDS: (Field | undefined)[] = ['amount', 'debit', 'credit', 'balance', 'fee', 'tax'];
const SUMMARY = /^(?:total|sub ?total|opening|closing|balance (?:b\/f|c\/f|brought|carried)|brought forward|carried forward|page \d)/i;
const BANKS: [RegExp, string][] = [
  [/consolidated bank|\bCBG\b/i, 'CBG'], [/\bGCB\b|ghana commercial/i, 'GCB'], [/ecobank/i, 'Ecobank'], [/fidelity/i, 'Fidelity'],
  [/stanbic/i, 'Stanbic'], [/\babsa\b/i, 'Absa'], [/calbank|cal bank/i, 'CalBank'], [/zenith/i, 'Zenith'], [/access bank/i, 'Access Bank'],
  [/\bUBA\b|united bank for africa/i, 'UBA'], [/republic bank/i, 'Republic Bank'], [/prudential/i, 'Prudential'], [/societe generale/i, 'SG'],
  [/agricultural development|\bADB\b/i, 'ADB'], [/\bNIB\b|national investment bank/i, 'NIB'], [/\bFNB\b|first national bank/i, 'FNB'],
  [/omnibsic/i, 'OmniBSIC'], [/standard chartered/i, 'StanChart'], [/first atlantic/i, 'First Atlantic'], [/bank of africa/i, 'Bank of Africa'],
  [/jpmorgan|chase/i, 'Chase'], [/bank of america/i, 'Bank of America'], [/wells fargo/i, 'Wells Fargo'], [/citibank|\bciti\b/i, 'Citi'],
  [/capital one/i, 'Capital One'], [/\bPNC\b/i, 'PNC'], [/\bu\.s\. bank\b|\bus bank\b/i, 'US Bank'],
];

const isDate = (text: string, order: 'day-first' | 'month-first') => { try { parseDate(text, order); return true; } catch { return false; } };
const height = (line: Line) => Math.max(...line.map(c => c.h ?? 10));

function lines(page: PdfCell[]): Line[] {
  const result: Line[] = [];
  for (const cell of [...page].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = result.find(line => Math.abs(line[0].y - cell.y) < 2);
    if (!line) { line = []; result.push(line); }
    line.push(cell);
  }
  return result.map(line => line.sort((a, b) => a.x - b.x));
}

/** A header line names a date, a description and an amount (or debit and credit). Unknown headers still mark column edges. */
function header(line: Line): Column[] | null {
  const columns: Column[] = [];
  const used = new Set<Field>();
  for (let i = 0; i < line.length; i++) {
    let matched = false;
    for (let length = Math.min(3, line.length - i); length >= 1; length--) {
      const part = line.slice(i, i + length);
      const label = part.map(c => c.text).join(' ');
      const field = fieldFor(label);
      if (field || (length > 1 && isIgnoredHeader(label))) {
        const last = part.at(-1)!;
        columns.push({ field: field && !used.has(field) ? field : undefined, x: part[0].x, right: last.x + (last.w ?? 0) });
        if (field) used.add(field);
        i += length - 1; matched = true; break;
      }
    }
    if (!matched) {
      // Long text in a header line (a title) disqualifies it; short unknown labels become ignored columns.
      if (line[i].text.length > 24 || /\d{3,}/.test(line[i].text)) return null;
      columns.push({ x: line[i].x, right: line[i].x + (line[i].w ?? 0) });
    }
  }
  const fields = columns.map(c => c.field);
  return validHeaders(fields) && fields.filter(Boolean).length >= 3 ? columns : null;
}

/** Each column owns the space from halfway after the previous header to halfway before the next. */
function columnFor(cell: PdfCell, columns: Column[]) {
  const centre = cell.x + (cell.w ?? 0) / 2;
  for (let i = 0; i < columns.length - 1; i++) {
    const edge = (Math.max(columns[i].right, columns[i].x) + columns[i + 1].x) / 2;
    if ((cell.w ? centre : cell.x + 1) < edge) return i;
  }
  return columns.length - 1;
}

/**
 * Rebuilds a wrapped cell. Statements wrap at spaces where they can and only split a token that is wider than the
 * column ("21538386000" + "01", "FT26012V91S" + "N\\BNK"). So a single-token fragment as wide as the column's widest
 * fragment is glued to the next one; so is a word cut before a lowercase continuation ("SalaryNovem" + "ber2025").
 */
function rebuild(fragments: string[], width: number) {
  return fragments.reduce((text, next, i) => {
    if (!text) return next;
    const prev = fragments[i - 1];
    const cut = (!/\s/.test(prev) && prev.length >= width && width >= 6) || (/[A-Za-z]$/.test(prev) && /^[a-z]/.test(next));
    return cut ? text + next : `${text} ${next}`;
  }, '');
}

function meta(pages: PdfCell[][], text: string): StatementMeta {
  const first = lines(pages[0] ?? []);
  /** Finds "Label : value" even when pdf.js splits the label into pieces ("Account", "Name", ":"). */
  const value = (label: RegExp) => {
    for (const line of first) for (let i = 0; i < line.length; i++) for (let length = 1; length <= 4 && i + length <= line.length; length++) {
      const match = label.exec(line.slice(i, i + length).map(c => c.text).join(' '));
      if (!match) continue;
      const parts = match[1]?.trim() ? [match[1].trim()] : [];
      for (const cell of line.slice(i + length)) {
        if (/^:$/.test(cell.text)) continue;
        if (/:\s*$/.test(cell.text) || (parts.length && /\s:\s/.test(cell.text))) break; // the next "Label :" on this line
        parts.push(cell.text.replace(/^:\s*/, ''));
        if (parts.length >= 6) break;
      }
      return parts.join(' ').trim();
    }
    return '';
  };
  const owner = value(/^(?:account|customer) name\s*:?\s*(.*)$/i);
  const number = value(/^(?:account (?:no\.?|number)|a\/c (?:no\.?|number)|acct\.? no\.?)\s*:?\s*(.*)$/i).replace(/\D/g, '');
  const bank = BANKS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Bank';
  const currency = /\bUSD\b|\$/.test(text) ? 'USD' : /\bGBP\b|£/.test(text) ? 'GBP' : /\bEUR\b|€/.test(text) ? 'EUR' : /\bGHS\b|GH₵/i.test(text) ? 'GHS' : undefined;
  return { owner: owner || undefined, account: number.length >= 4 ? `${bank} ••${number.slice(-4)}` : undefined, currency };
}

/**
 * Layout engine for tabular statements: finds the header row on every page, assigns text to columns by position,
 * follows rows that wrap over several lines and pages, and skips titles, summaries and footers.
 * Amounts that would land on a continuation line are refused rather than guessed.
 */
export function pdfTable(pages: PdfCell[][]): { table: string[][]; text: string; meta?: StatementMeta; warnings?: string[] } {
  const officialMomo = officialMomoPdfTable(pages);
  if (officialMomo) return officialMomo;
  const momo = momoPdfTable(pages);
  if (momo) return momo;
  const table: string[][] = [];
  const source: string[] = [];
  const rawText = pages.flat().map(cell => cell.text).join(' ');
  const dateOrder = /\bUSD\b|\$/.test(rawText) ? 'month-first' : 'day-first';
  let fields: Field[] = [];
  let current: string[][] | null = null; // per field, the text fragments of each wrapped line
  const records: string[][][] = [];
  const slot = (column: Column) => column.field ? fields.indexOf(column.field) : -1;
  let columns: Column[] = [];
  for (const page of pages) {
    // Columns carry over for banks that print the header once; such a page opens only at its first dated row.
    let headerOnPage = false;
    const rowsBefore = records.length;
    let lastY = 0;
    let headerY = 0;
    let open = false;
    for (const line of lines(page)) {
      const joined = line.map(c => c.text).join(' ');
      source.push(joined);
      const found = header(line);
      if (found) {
        const pageFields = found.filter(c => c.field).map(c => c.field!);
        if (!fields.length) { fields = pageFields; table.push(fields); }
        else if (pageFields.join() !== fields.join()) throw new Error('The PDF changes column layout between pages. Export a CSV for review.');
        columns = found; headerY = lastY = line[0].y; open = true; headerOnPage = true;
        continue;
      }
      if (!columns.length) {
        // A dated numeric row before any header could be a transaction we can't place.
        if (line.some(c => isDate(c.text, dateOrder)) && line.filter(c => MONEY.test(c.text) && /\.\d{2}\b/.test(c.text)).length >= 2) throw new Error('Dated amounts appear outside a recognised PDF table. Export a CSV to avoid missing transactions.');
        continue;
      }
      const values = columns.map(() => '');
      for (const cell of line) { const i = columnFor(cell, columns); values[i] = [values[i], cell.text].filter(Boolean).join(' '); }
      const dateText = values[columns.findIndex(c => c.field === 'date')];
      if (!open) {
        if (!dateText || !isDate(dateText, dateOrder)) continue;
        open = true; current = null;
      }
      const describedAs = values[columns.findIndex(c => c.field === 'name')] ?? '';
      const gap = lastY - line[0].y;
      if (dateText && isDate(dateText, dateOrder)) {
        if (SUMMARY.test(describedAs)) { current = null; lastY = line[0].y; continue; } // "Balance B/F" style rows
        current = fields.map(() => []);
        values.forEach((v, i) => { const at = slot(columns[i]); if (v && at >= 0) current![at].push(v); });
        records.push(current);
        lastY = line[0].y;
        continue;
      }
      // Two-line headers ("Cheque / Number", "Date & / Time") sit just under the header.
      if (lastY === headerY && gap < height(line) * 1.8 && !/\d/.test(joined)) { lastY = line[0].y; continue; }
      if (SUMMARY.test(joined.trim())) { open = false; continue; }
      // Any amount on a continuation line (in a money column, or a bare "20.00" anywhere) could be a hidden transaction.
      const carriesMoney = values.some((v, i) => v && MONEY_FIELDS.includes(columns[i].field) && MONEY.test(v))
        || line.some(c => MONEY.test(c.text) && /\.\d{2}\b/.test(c.text));
      const near = gap <= height(line) * (lastY === headerY ? 4 : 2.6);
      if (current && near) {
        if (carriesMoney) throw new Error('A PDF row wraps across lines. Export a CSV so no amounts are missed.');
        values.forEach((v, i) => { const at = slot(columns[i]); if (v && at >= 0) current![at].push(v); });
        lastY = line[0].y;
        continue;
      }
      if (carriesMoney && /\.\d{2}\b/.test(joined)) throw new Error('A PDF row wraps across lines. Export a CSV so no amounts are missed.');
      open = false; // footer, disclaimer or blank space: the table on this page has ended
    }
    // Pages of transactions without a header we recognise must not be skipped silently.
    // A cover page with a period ("01-01-2026 To 13-11-2026") is fine; timestamps or many dates are not.
    const dates = page.filter(c => isDate(c.text, dateOrder) || /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(c.text));
    if (!headerOnPage && records.length === rowsBefore && (dates.length >= 3 || dates.some(c => /\d{1,2}:\d{2}/.test(c.text)))) {
      throw new Error('A PDF page contains rows without recognised headers. Export a CSV to avoid an incomplete import.');
    }
  }
  const widths = fields.map((_, f) => Math.max(0, ...records.flatMap(r => r[f].map(part => part.length))));
  for (const record of records) table.push(record.map((parts, f) => rebuild(parts, widths[f])));
  const text = source.join('\n');
  return { table, text, meta: meta(pages, text) };
}
