import { PdfCell, pdfTable } from './pdf-table';
import { parseDate, rowsToDraft } from './parse-statement';

/** Column x positions and spacing modelled on a Consolidated Bank Ghana (CBG) statement. */
const X = { date: 31, narrative: 126, reference: 222, value: 317, cheque: 412, debit: 508, credit: 603, balance: 698 };
const LINE = 12.7;
const cell = (text: string, x: number, y: number): PdfCell => ({ text, x, y, w: text.length * 6, h: 10 });

/** One transaction whose narrative and reference wrap over several lines, as banks print them. */
function row(y: number, date: string, narrative: string[], reference: string[], debit = '', credit = '', balance = ''): PdfCell[] {
  return [
    cell(date, X.date, y), cell(date, X.value, y),
    ...narrative.map((t, i) => cell(t, X.narrative, y - i * LINE)),
    ...reference.map((t, i) => cell(t, X.reference, y - i * LINE)),
    ...(debit ? [cell(debit, X.debit, y)] : []), ...(credit ? [cell(credit, X.credit, y)] : []), cell(balance, X.balance, y),
  ];
}
const header = (y: number): PdfCell[] => [
  cell('Date', X.date, y), cell('Narrative', X.narrative, y), cell('Reference', X.reference, y), cell('Value Date', X.value, y),
  cell('Cheque', X.cheque, y), cell('Number', X.cheque, y - LINE), cell('Debit', X.debit, y), cell('Credit', X.credit, y), cell('Balance', X.balance, y),
];
const block = (): PdfCell[] => [
  cell('Period : From', 27, 596), cell('01-01-2026 To 13-11-2026', 140, 596), cell('Account No :', 412, 596), cell('2153838600001', 519, 596),
  cell('Currency :', 31, 576), cell('GHS', 123, 576), cell('Opening Balance :', 412, 576), cell('24.15', 565, 576),
  cell('Account Name :', 31, 556), cell('MAC-ARTHUR IMMANUEL JUSTICE', 153, 556), cell('Total Credit :', 412, 556), cell('76075.14', 535, 556),
  cell('Account Type :', 31, 536), cell('YOLO ACCOUNT', 153, 536), cell('Closing Balance :', 412, 516), cell('21.13', 565, 516),
];
const footer = (page: number): PdfCell[] => [
  cell('Consolidated Bank Ghana Ltd. This statement is computer generated and requires no signature.', 31, 60),
  cell(`Page ${page} of 2`, 650, 30),
];
const fixture = (): PdfCell[][] => [
  [
    ...block(), ...header(445),
    ...row(412, '12 JAN 26', ['Mobile', 'Money', 'Service', 'Charge', '21538386000', '01 to', 'PL52111'], ['FT26012V91S', 'N\\BNK'], '0.1', '', '14.05'),
    ...row(315, '28 JAN 26', ['CBG', 'SalaryNovem', 'ber2025'], ['FT26028GBL5', '0\\BNK'], '', '1,958.75', '1,972.80'),
    ...row(270, '28 JAN 26', ['DIGITAL', 'SERVICES', 'JAN 2026'], ['FT260281JTY', 'B'], '10', '', '1,962.80'),
    ...row(225, '28 JAN 26', ['Mobile', 'Money', 'Service', 'Charge'], ['FT26028D54T', 'J\\BNK'], '19', '', '1,943.80'),
    ...row(160, '28 JAN 26', ['GIP', 'Outwards', 'Acc2Wallet', 'MTN', '0559133863'], ['FT26028GQ91', 'P\\BNK'], '1,900.00', '', '43.8'),
    ...row(85, '29 JAN 26', ['CBG'], ['FT260295NRK'], '', '4,000.00', '4,043.80'),
    ...footer(1),
  ],
  [
    ...header(760),
    cell('Sub', X.narrative, 735), cell('G\\BNK', X.reference, 735), // continues the 29 JAN row from page 1
    ...row(705, '30 JAN 26', ['GIP', 'Outwards', 'Acc2Wallet', 'MTN', '0559133863'], ['FT260307CVJ'], '600.00', '', '3,443.80'),
    ...row(640, '31 JAN 26', ['Balance B/F'], [], '', '', '3,443.80'),
    cell('Total', X.date, 600), cell('2,529.10', X.debit, 600), cell('5,958.75', X.credit, 600),
    ...footer(2),
  ],
];

describe('Bank statement PDFs (generic layout engine)', () => {
  it('reads a CBG-style statement: wrapped narratives, two-line headers, rows split across pages', () => {
    const result = pdfTable(fixture());
    const draft = rowsToDraft(result.table, result.text, result.meta);
    expect(draft.rows.map(r => r.amountMinor)).toEqual([-10, 195875, -1000, -1900, -190000, 400000, -60000]);
    expect(draft.rows[0].name).toBe('Mobile Money Service Charge 2153838600001 to PL52111');
    expect(draft.rows[1].name).toBe('CBG SalaryNovember2025');
    expect(draft.rows[5].name).toBe('CBG Sub');
    expect(draft.rows[5].reference).toBe('FT260295NRKG\\BNK');
    expect(draft.rows[0].reference).toBe('FT26012V91SN\\BNK');
    expect(draft.rows[0].date).toBe('2026-01-12T00:00:00');
    expect(draft.rows.map(r => r.category)).toEqual(['charges', 'received', 'charges', 'charges', 'transfers', 'received', 'transfers']);
    expect(draft.balanceCheck).toEqual({ checked: 6, breaks: 0 });
    expect(draft.account).toBe('CBG ••0001');
    expect(result.meta?.owner).toBe('MAC-ARTHUR IMMANUEL JUSTICE');
  });

  it('flags a misread row through the running balance', () => {
    const pages = fixture();
    pages[0].find(c => c.text === '19')!.text = '91';
    const draft = rowsToDraft(pdfTable(pages).table, '', {});
    expect(draft.balanceCheck?.breaks).toBeGreaterThan(0);
  });

  it('understands the date styles banks print', () => {
    expect(parseDate('12 JAN 26')).toBe('2026-01-12T00:00:00');
    expect(parseDate('3-Sept-2026')).toBe('2026-09-03T00:00:00');
    expect(parseDate('01/02/2026 2:05 PM')).toBe('2026-02-01T14:05:00');
    expect(() => parseDate('31 FEB 26')).toThrow();
    expect(() => parseDate('12 JUNK 26')).toThrow();
  });
});
