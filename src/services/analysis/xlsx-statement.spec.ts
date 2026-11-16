import { utils, write } from 'xlsx';
import { parseXlsx } from './xlsx-statement';
import { MappingRequiredError } from './column-mapping';

function workbook(sheets: { name: string; rows: unknown[][] }[]): ArrayBuffer {
  const book = utils.book_new();
  for (const sheet of sheets) utils.book_append_sheet(book, utils.aoa_to_sheet(sheet.rows), sheet.name);
  return write(book, { bookType: 'xlsx', type: 'array' });
}

describe('Excel statement imports', () => {
  it('finds a header below title rows and combines worksheets with the same layout', () => {
    const data = workbook([
      { name: 'October', rows: [['Vodafone Cash Statement'], [], ['Date', 'Description', 'Amount', 'Fee', 'Balance', 'ID'],
        [new Date(2026, 9, 31, 12), 'Food shop', -12.5, .25, 87.25, 'V1']] },
      { name: 'November', rows: [['Date', 'Description', 'Amount', 'Fee', 'Balance', 'ID'],
        [new Date(2026, 10, 1, 9, 30), 'Salary', 1000, 0, 1087.25, 'V2']] },
    ]);
    const draft = parseXlsx(data);
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows[0]).toMatchObject({ amountMinor: -1250, feeMinor: 25, balanceMinor: 8725, providerId: 'V1', category: 'food' });
    expect(draft.rows[1]).toMatchObject({ amountMinor: 100000, balanceMinor: 108725, providerId: 'V2', category: 'received' });
    expect(draft.warnings.some(warning => warning.includes('“October”, “November”'))).toBe(true);
  });

  it('refuses to merge worksheets with different transaction schemas', () => {
    const data = workbook([
      { name: 'Wallet', rows: [['Date', 'Name', 'Amount'], ['2026-11-01', 'Food', -10]] },
      { name: 'Bank', rows: [['Date', 'Name', 'Debit', 'Credit'], ['2026-11-01', 'Food', 10, '']] },
    ]);
    expect(() => parseXlsx(data)).toThrow(/different transaction tables/i);
  });

  it('rejects workbooks without a recognisable transaction table', () => {
    expect(() => parseXlsx(workbook([{ name: 'Summary', rows: [['Monthly report'], ['Total', 100]] }]))).toThrow(/recognise a transaction table/i);
  });

  it('supports a reviewed mapping for an unfamiliar worksheet layout', () => {
    const data = workbook([{ name: 'Activity', rows: [['Wallet report'], ['When', 'Who', 'Out', 'In'], ['2026-11-01', 'Coffee', 10, ''], ['2026-11-02', 'Refund', '', 5]] }]);
    expect(() => parseXlsx(data)).toThrow(MappingRequiredError);
    const draft = parseXlsx(data, { source: 'xlsx', sheet: 'Activity', headerIndex: 1, fields: ['date', 'name', 'debit', 'credit'] });
    expect(draft.rows.map(row => row.amountMinor)).toEqual([-1000, 500]);
    expect(draft.warnings.join()).toContain('mapped manually');
  });
});
