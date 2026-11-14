import { PdfCell, pdfTable } from './pdf-table';
import { rowsToDraft, parseCsv } from './parse-statement';
import Papa from 'papaparse';

const xs = [35, 115, 169, 212, 265, 308, 372, 410, 447, 501];
const line = (values: string[], y: number): PdfCell[] => values.flatMap((text, i) => text ? [{ text, x: xs[i], y }] : []);
const header = () => [
  ...line(['Date &', 'Payment', 'To/From', 'Account', 'Amount', 'Transaction ID', 'Fees', 'Tax', 'Balance', 'Reference'], 800),
  ...line(['Time', 'Type', '', 'Name'], 790),
];
const footer = (page: number, total = 2): PdfCell => ({ text: `Page ${page} of ${total}`, x: 530, y: 25 });
const fixture = (): PdfCell[][] => [
  [{ text: 'Wallet number:', x: 30, y: 850 }, ...header(),
    ...line(['13 Nov 2026 09:45', 'MOMO USER', '', 'TEST PERSON', '-50.00', '111', 'GHS 0.00', 'GHS 0.00', 'GHS 100.00', 'Food'], 760),
    ...line(['12 Nov 2026 07:00', 'AIRTIME', '', 'VENDOR', '-4.00', '112', 'GHS 0.38', 'GHS 0.10', 'GHS 150', 'Reference begins'], 50), footer(1)],
  [...header(), ...line(['', '', '', 'CONTINUED', '', '', '', '', '', 'across page'], 760),
    ...line(['1 Nov 2026 08:00', 'CASH IN', '', 'TEST SENDER', '+100.00', '113', 'GHS 0.00', 'GHS 0.00', 'GHS 154.48', '-'], 730), footer(2)],
];

describe('MTN MoMo PDF export', () => {
  it('handles two-line headers, named-month dates and rows continued on another page', () => {
    const result = pdfTable(fixture());
    const draft = rowsToDraft(result.table, result.text);
    expect(draft.rows).toHaveLength(3);
    expect(draft.rows[1].name).toBe('VENDOR CONTINUED');
    expect(draft.rows[1].reference).toBe('Reference begins across page');
    expect(draft.rows[1].category).toBe('airtime');
    expect(draft.rows[1].feeMinor).toBe(48);
    expect(draft.rows[2].date).toBe('2026-11-01T08:00:00');
    expect(parseCsv(Papa.unparse(result.table)).rows).toEqual(draft.rows);
  });
  it('rejects missing or reordered pages instead of returning a partial import', () => {
    expect(() => pdfTable([fixture()[0]])).toThrow(/missing or out of order/);
  });
  it('rejects unrecognised monetary cells', () => {
    const pages = fixture();
    const fee = pages[0].find(c => c.x === 372 && c.y === 760)!;
    fee.text = 'unreadable';
    expect(() => pdfTable(pages)).toThrow(/invalid fee/);
  });
});
