import { Field, fieldFor, validHeaders } from './statement-fields';
import { ColumnMapping, ColumnMappingRequest } from './column-mapping';

export interface AdaptiveTable {
  table: string[][];
  headerIndex: number;
  headerDepth: 1 | 2;
  inferred: { column: string; field: Field }[];
  confidence: number;
}

interface CandidateTable extends AdaptiveTable {
  score: number;
  unsafeRows: number[];
}

interface Profile {
  index: number;
  values: string[];
  dateRate: number;
  moneyRate: number;
  textRate: number;
}

const canonical = (field: Field | undefined, fallback: string) => field ?? fallback;
const filled = (row: string[], width: number) => Array.from({ length: width }, (_, index) => (row[index] ?? '').trim());

function profiles(rows: string[][], width: number, dateWorks: (value: string) => boolean, moneyWorks: (value: string) => boolean): Profile[] {
  return Array.from({ length: width }, (_, index) => {
    const values = rows.map(row => (row[index] ?? '').trim()).filter(Boolean);
    const count = Math.max(1, values.length);
    return {
      index,
      values,
      dateRate: values.filter(dateWorks).length / count,
      moneyRate: values.filter(moneyWorks).length / count,
      textRate: values.filter(value => /[A-Za-z]{2}/.test(value) && !dateWorks(value) && !moneyWorks(value)).length / count,
    };
  });
}

function uniqueBest(candidates: { index: number; score: number }[], minimum: number) {
  const ordered = candidates.filter(candidate => candidate.score >= minimum).sort((a, b) => b.score - a.score);
  if (!ordered.length || (ordered[1] && ordered[0].score - ordered[1].score < .12)) return -1;
  return ordered[0].index;
}

function inferCandidate(header: string[], data: string[][], dateWorks: (value: string) => boolean, moneyWorks: (value: string) => boolean) {
  const width = header.length;
  const fields = header.map(fieldFor);
  const inferred: { column: string; field: Field }[] = [];
  const used = new Set(fields.filter((field): field is Field => !!field));
  const sample = data.filter(row => row.some(cell => cell.trim())).slice(0, 250).map(row => filled(row, width));
  if (!sample.length || (sample.length < 2 && !validHeaders(fields))) return null;
  const stats = profiles(sample, width, dateWorks, moneyWorks);
  const assign = (index: number, field: Field) => {
    if (index < 0 || fields[index] || used.has(field)) return false;
    fields[index] = field; used.add(field); inferred.push({ column: header[index] || `Column ${index + 1}`, field }); return true;
  };

  if (!used.has('date')) assign(uniqueBest(stats.filter(stat => !fields[stat.index]).map(stat => ({ index: stat.index, score: stat.dateRate })), .72), 'date');
  if (!used.has('name')) {
    const names = stats.filter(stat => !fields[stat.index] && stat.values.length >= Math.min(3, sample.length))
      .map(stat => ({ index: stat.index, score: stat.textRate + Math.min(.2, stat.values.reduce((sum, value) => sum + value.length, 0) / stat.values.length / 100) }));
    assign(uniqueBest(names, .72), 'name');
  }

  if (!used.has('amount') && !(used.has('debit') && used.has('credit'))) {
    const money = stats.filter(stat => !fields[stat.index] && stat.moneyRate >= .85 && stat.values.length >= Math.min(3, sample.length));
    if (money.length === 1) assign(money[0].index, 'amount');
  }

  if (!validHeaders(fields) || new Set(fields.filter(Boolean)).size !== fields.filter(Boolean).length) return null;
  const declared = fields.filter(Boolean).length - inferred.length;
  const confidence = Math.min(1, .58 + declared * .055 + Math.max(0, sample.length - 2) * .002 - inferred.length * .04);
  return { fields, inferred, confidence, sample };
}

/**
 * Finds a transaction table in ordinary delimited/spreadsheet rows. It understands one- and two-line headings and
 * can infer a missing date, description or single signed-amount column from strongly typed values. It deliberately
 * refuses ambiguous unsigned money columns because guessing debit versus credit would reverse cash flow.
 */
export function inferStatementTable(rows: string[][], dateWorks: (value: string) => boolean, moneyWorks: (value: string) => boolean): AdaptiveTable {
  const candidates: CandidateTable[] = [];
  for (let headerIndex = 0; headerIndex < Math.min(100, rows.length - 1); headerIndex++) {
    for (const depth of [1, 2] as const) {
      if (headerIndex + depth >= rows.length) continue;
      const width = Math.max(rows[headerIndex]?.length ?? 0, depth === 2 ? rows[headerIndex + 1]?.length ?? 0 : 0);
      if (width < 3 || width > 40) continue;
      const header = Array.from({ length: width }, (_, index) => [rows[headerIndex]?.[index], depth === 2 ? rows[headerIndex + 1]?.[index] : ''].filter(Boolean).join(' ').trim());
      const data = rows.slice(headerIndex + depth);
      const result = inferCandidate(header, data, dateWorks, moneyWorks);
      if (!result) continue;
      const dateAt = result.fields.indexOf('date');
      const transactionRows = data.filter(row => dateWorks((row[dateAt] ?? '').trim()));
      if (!transactionRows.length) continue;
      const moneyIndexes = result.fields.flatMap((field, index) => field && ['amount', 'debit', 'credit'].includes(field) ? [index] : []);
      const unsafeRows = data.flatMap((row, offset) => {
        if (dateWorks((row[dateAt] ?? '').trim()) || validHeaders(row.map(fieldFor))) return [];
        const joined = row.join(' ').trim();
        if (/^(?:total|sub ?total|opening|closing|balance (?:b\/f|c\/f|brought|carried)|brought forward|carried forward)/i.test(joined)) return [];
        return moneyIndexes.some(index => (row[index] ?? '').trim() && (row[index] ?? '').trim() !== '-') ? [headerIndex + depth + offset + 1] : [];
      });
      const score = result.confidence * 100 + Math.min(20, transactionRows.length) - headerIndex * .1 - (depth - 1) - unsafeRows.length * 5;
      candidates.push({
        table: [result.fields.map((field, index) => canonical(field, header[index])), ...transactionRows.map(row => filled(row, width))],
        headerIndex, headerDepth: depth, inferred: result.inferred, confidence: result.confidence, score, unsafeRows,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) throw new Error('Could not safely identify date, description and amount columns. No transactions were imported.');
  const competing = candidates.find(candidate => candidate !== best && best.score - candidate.score < 2 && candidate.table[0].join('|') !== best.table[0].join('|'));
  if (competing) throw new Error('Two different transaction-column interpretations look equally likely. No transactions were imported.');
  if (best.unsafeRows.length) throw new Error(`Row ${best.unsafeRows[0]} has an amount but no supported transaction date. No transactions were imported.`);
  const { score: _score, unsafeRows: _unsafeRows, ...table } = best;
  return table;
}

/** Best grid-like heading for a person to map when automatic inference is not decisive. */
export function mappingRequest(rows: string[][], source: ColumnMappingRequest['source'], sheet?: string): ColumnMappingRequest | null {
  const candidates = rows.slice(0, 100).flatMap((row, headerIndex) => {
    const headers = row.map(cell => cell.trim());
    const width = headers.length;
    if (width < 3 || width > 30 || headers.filter(Boolean).length < 3 || !rows.slice(headerIndex + 1, headerIndex + 4).length) return [];
    const labelScore = headers.filter(value => /[A-Za-z]{2}/.test(value) && value.length <= 50).length;
    const populated = rows.slice(headerIndex + 1, headerIndex + 6).reduce((count, data) => count + data.slice(0, width).filter(Boolean).length, 0);
    return [{ headerIndex, headers, score: labelScore * 10 + populated - headerIndex * .2 }];
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  return {
    source, sheet, headerIndex: best.headerIndex, headers: best.headers,
    preview: rows.slice(best.headerIndex + 1, best.headerIndex + 6).map(row => filled(row, best.headers.length)),
  };
}

export function mappedStatementTable(rows: string[][], mapping: ColumnMapping, dateWorks: (value: string) => boolean): string[][] {
  const header = rows[mapping.headerIndex] ?? [];
  if (mapping.fields.length !== header.length) throw new Error('The saved column mapping no longer matches this file.');
  const mapped = mapping.fields.filter(field => field !== 'ignore');
  if (!validHeaders(mapping.fields.map(field => field === 'ignore' ? undefined : field)) || new Set(mapped).size !== mapped.length) {
    throw new Error('Choose one Date, one Description, and either one signed Amount or separate Debit and Credit columns.');
  }
  const dateAt = mapping.fields.indexOf('date');
  const moneyIndexes = mapping.fields.flatMap((field, index) => ['amount', 'debit', 'credit'].includes(field) ? [index] : []);
  const data = rows.slice(mapping.headerIndex + 1);
  const transactions: string[][] = [];
  for (const [offset, row] of data.entries()) {
    if (dateWorks((row[dateAt] ?? '').trim())) { transactions.push(filled(row, header.length)); continue; }
    const joined = row.join(' ').trim();
    if (!joined || /^(?:total|sub ?total|opening|closing|balance (?:b\/f|c\/f|brought|carried)|brought forward|carried forward)/i.test(joined)) continue;
    if (moneyIndexes.some(index => (row[index] ?? '').trim() && (row[index] ?? '').trim() !== '-')) {
      throw new Error(`Row ${mapping.headerIndex + offset + 2} has an amount but no supported transaction date. No transactions were imported.`);
    }
  }
  if (!transactions.length) throw new Error('The selected columns contain no readable transactions.');
  return [mapping.fields.map((field, index) => field === 'ignore' ? header[index] : field), ...transactions];
}
