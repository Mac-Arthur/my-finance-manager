import { PdfCell, pdfTable } from './pdf-table';
import { rowsToDraft } from './parse-statement';

const starts = [89, 216, 300, 395, 472, 550, 612, 652, 701, 789, 898, 982, 1055, 1137, 1211, 1298];
const words = [
  ['TRANSACTION', 'DATE'], ['FROM', 'ACCT'], ['FROM', 'NAME'], ['FROM', 'NO.'], ['TRANS.', 'TYPE'], ['AMOUNT'], ['FEES'], ['E-LEVY'],
  ['BAL', 'BEFORE'], ['BAL', 'AFTER'], ['TO', 'NO.'], ['TO', 'NAME'], ['TO', 'ACCT'], ['F_ID'], ['REF'], ['OVA'],
];
const cell = (text: string, x: number, y: number): PdfCell => ({ text, x, y, w: text.length * 4.5, h: 8 });
const header = words.flatMap((parts, column) => parts.map((part, index) => cell(part, starts[column] + index * 28, 417)));
const at = (column: number, text: string, y: number) => cell(text, starts[column] + 5, y);

function fixture(): PdfCell[][] {
  return [[
    cell('MOBILE', 528, 516), cell('MONEY', 584, 516), cell('TRANSACTION', 636, 516), cell('HISTORY', 736, 516),
    cell('MSISDN:', 463, 472), cell('233559133863', 528, 472), cell('ACCOUNT', 628, 472), cell('HOLDER', 680, 472),
    cell('NAME:', 725, 472), cell('TEST', 780, 472), cell('PERSON', 810, 472),
    ...header,
    at(0, '13-Nov-2026', 396), cell('11:00:00', 142, 396), cell('AM', 176, 396), at(1, '93014236', 396), at(2, 'TEST PERSON', 401), at(3, '233559133863', 396),
    at(4, 'TRANSFER', 396), at(5, '10', 396), at(6, '0.5', 396), at(7, '0.1', 396), at(8, '100', 396), at(9, '89.4', 396),
    at(10, '233200000000', 396), at(11, 'FOOD', 401), at(11, 'SHOP', 391), at(12, '12345678', 396), at(13, 'TX2', 396),
    at(14, 'Lunch', 396), at(15, 'Internal', 396),
    at(0, '13-Nov-2026', 370), cell('09:00:00', 142, 370), cell('AM', 176, 370), at(1, '87654321', 370), at(2, 'SENDER NAME', 375), at(3, '0', 370),
    at(4, 'TRANSFER', 370), at(5, '50', 370), at(6, '0', 370), at(7, '0', 370), at(8, '50', 370), at(9, '100', 370),
    at(10, '233559133863', 370), at(11, 'TEST PERSON', 370), at(12, '93014236', 370), at(13, 'TX1', 370),
    at(14, 'Salary', 370), at(15, 'Internal', 370),
    at(0, '12-Nov-2026', 344), cell('08:00:00', 142, 344), cell('AM', 176, 344), at(1, '93014236', 344), at(2, 'TEST PERSON', 349), at(3, '233559133863', 344),
    at(4, 'DEBT_REPAYMENT', 344), at(5, '0', 344), at(6, '0', 344), at(7, '0', 344), at(8, '100', 344), at(9, '100', 344),
    at(10, '0', 344), at(11, 'MoMoBoost', 344), at(12, '0', 344), at(13, 'TX1', 344), at(14, 'MoMoBoost', 344),
  ]];
}

function compactFixture(): PdfCell[][] {
  const body = fixture()[0]
    .filter(item => item.y !== 417 && !/^\d{2}:\d{2}:\d{2}$/.test(item.text) && !/^(?:AM|PM)$/.test(item.text))
    .filter(item => !(item.y === 472 && ['ACCOUNT', 'HOLDER', 'NAME:'].includes(item.text)))
    .map(item => {
      if (item.text === '13-Nov-2026' && item.y === 396) return { ...item, text: '13-Nov-2026 11:00:00 AM' };
      if (item.text === '13-Nov-2026' && item.y === 370) return { ...item, text: '13-Nov-2026 09:00:00 AM' };
      if (item.text === '12-Nov-2026') return { ...item, text: '12-Nov-2026 08:00:00 AM' };
      return item;
    });
  const compactHeader = words.map((parts, column) => cell(parts.join(' '), starts[column], 417));
  return [[...body, cell('ACCOUNT HOLDER NAME:', 628, 472), ...compactHeader]];
}

describe('Official MTN Mobile Money Transaction History PDF', () => {
  it('uses the wallet side for direction and reconstructs wrapped counterparties', () => {
    const extracted = pdfTable(fixture());
    const draft = rowsToDraft(extracted.table, extracted.text, extracted.meta);
    expect(draft.account).toBe('MTN MoMo ••3863');
    expect(extracted.meta?.owner).toBe('TEST PERSON');
    expect(draft.rows.map(row => row.amountMinor)).toEqual([-1000, 5000]);
    expect(draft.rows[0]).toMatchObject({ name: 'FOOD SHOP', feeMinor: 60, balanceMinor: 8940, providerId: 'TX2' });
    expect(draft.rows[1]).toMatchObject({ name: 'SENDER NAME', balanceMinor: 10000, providerId: 'TX1' });
    expect(draft.balanceCheck).toEqual({ checked: 1, breaks: 0 });
    expect(extracted.warnings).toContain('Ignored 1 MTN system event that had zero amount, zero fees and no balance change.');
  });

  it('refuses a later page whose official header is missing', () => {
    expect(() => pdfTable([...fixture(), [cell('13-Nov-2026', 94, 396)]])).toThrow(/page 2.*column layout/i);
  });

  it('accepts MTN reports whose headings and date-times are single PDF text runs', () => {
    const extracted = pdfTable(compactFixture());
    const draft = rowsToDraft(extracted.table, extracted.text, extracted.meta);
    expect(draft.account).toBe('MTN MoMo ••3863');
    expect(extracted.meta?.owner).toBe('TEST PERSON');
    expect(draft.rows.map(row => row.amountMinor)).toEqual([-1000, 5000]);
  });
});
