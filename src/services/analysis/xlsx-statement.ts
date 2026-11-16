import { read, utils, WorkSheet } from 'xlsx';
import { AnalysisDraft } from '../../models/analysis';
import { addInferenceWarning, dateWorks, inferTable, rowsToDraft } from './parse-statement';
import { mappedStatementTable, mappingRequest } from './adaptive-table';
import { ColumnMapping, MappingRequiredError } from './column-mapping';

interface Candidate {
  sheet: string;
  table: string[][];
  inference: ReturnType<typeof inferTable>;
  formulas: boolean;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && Number.isFinite(+value)) {
    const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const time = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
    return `${date}T${time}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : String(value).trim();
}

function sheetRows(sheet: WorkSheet): string[][] {
  return utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: false })
    .map(row => row.map(valueText))
    .map(row => { while (row.length && !row.at(-1)) row.pop(); return row; })
    .filter(row => row.some(Boolean));
}

function candidate(name: string, sheet: WorkSheet): Candidate | null {
  const rows = sheetRows(sheet);
  if (rows.length < 2) return null;
  let inference: ReturnType<typeof inferTable>;
  try { inference = inferTable(rows); } catch { return null; }
  const formulas = Object.keys(sheet).some(key => !key.startsWith('!') && !!sheet[key]?.f);
  return { sheet: name, table: inference.table, inference, formulas };
}

/** Reads ordinary statement workbooks and sends their cells through the same strict parser as CSV. */
export function parseXlsx(data: ArrayBuffer | Uint8Array, mapping?: ColumnMapping): AnalysisDraft {
  let workbook;
  try {
    workbook = read(data, { type: 'array', cellDates: true, sheetRows: 10_002 });
  } catch {
    throw new Error('This Excel workbook could not be read. Export it again as .xlsx and retry.');
  }
  const hidden = new Set((workbook.Workbook?.Sheets ?? []).filter(sheet => sheet.Hidden).map(sheet => sheet.name));
  if (mapping) {
    if (mapping.source !== 'xlsx' || !mapping.sheet || hidden.has(mapping.sheet) || !workbook.Sheets[mapping.sheet]) throw new Error('The selected worksheet is no longer available.');
    const rows = sheetRows(workbook.Sheets[mapping.sheet]);
    const table = mappedStatementTable(rows, mapping, dateWorks);
    const source = `Worksheet: ${mapping.sheet}\n${table.map(row => row.join(' | ')).join('\n')}`;
    const draft = rowsToDraft(table, source);
    draft.warnings.push(`Columns in worksheet “${mapping.sheet}” were mapped manually. Compare the preview with the original before confirming.`);
    return draft;
  }
  const candidates = workbook.SheetNames.filter(name => !hidden.has(name)).flatMap(name => {
    const found = candidate(name, workbook.Sheets[name]);
    return found ? [found] : [];
  });
  if (!candidates.length) {
    const visible = workbook.SheetNames.filter(name => !hidden.has(name));
    const request = visible.flatMap(name => {
      const found = mappingRequest(sheetRows(workbook.Sheets[name]), 'xlsx', name);
      return found ? [found] : [];
    })[0];
    if (request) throw new MappingRequiredError(request);
    throw new Error('Could not recognise a transaction table in this workbook. A sheet needs date, description and signed amount columns, or debit and credit columns.');
  }
  const signature = (entry: Candidate) => entry.table[0].join('|');
  const signatures = new Set(candidates.map(signature));
  if (signatures.size > 1) throw new Error('This workbook contains different transaction tables on multiple sheets. Import one account layout at a time so columns are not mixed.');
  const table = [candidates[0].table[0], ...candidates.flatMap(entry => entry.table.slice(1))];
  const source = candidates.map(entry => `Worksheet: ${entry.sheet}\n${entry.table.map(row => row.join(' | ')).join('\n')}`).join('\n\n');
  const draft = rowsToDraft(table, source);
  for (const entry of candidates) addInferenceWarning(draft, entry.inference);
  const sheetNames = candidates.map(entry => `“${entry.sheet}”`).join(', ');
  draft.warnings.push(`Excel import used ${candidates.length === 1 ? 'worksheet' : 'worksheets'} ${sheetNames}. Check the preview before confirming.`);
  if (candidates.some(entry => entry.formulas)) draft.warnings.push('Formula cells use the values last saved in the workbook. Open and save the file in Excel if those values look stale.');
  return draft;
}
