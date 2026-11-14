import { categoryFor, moneyMinor, parseCsv, parseDate } from './parse-statement';
import { pdfTable, PdfCell } from './pdf-table';
import { rowsToDraft } from './parse-statement';

describe('Statement parsing', () => {
  it('parses quoted CSV fields, signed amounts and fees without floating point loss', () => {
    const draft = parseCsv('date,name,amount,fee,balance,id\n2026-10-31T12:30,"Food, shop",-12.34,0.38,87.28,A1\n2026-11-01,Salary,1000,0,1087.28,A2');
    expect(draft.rows[0].amountMinor).toBe(-1234);
    expect(draft.rows[0].feeMinor).toBe(38);
    expect(draft.rows[0].category).toBe('food');
    expect(draft.rows[1].category).toBe('received');
    expect(draft.rows[0].name).toBe('Food, shop');
  });
  it('supports debit/credit columns and day-first dates explicitly', () => {
    const draft = parseCsv('date;description;debit;credit\n13/11/2026;Coffee;10.50;\n14/11/2026;Refund;;20');
    expect(draft.rows.map(row => row.amountMinor)).toEqual([-1050, 2000]);
    expect(draft.rows[0].date).toBe('2026-11-13T00:00:00');
    expect(draft.rows[0].balanceMinor).toBeNull();
    expect(draft.warnings.join()).toContain('day/month/year');
  });
  it('rejects ambiguous or malformed rows instead of silently dropping them', () => {
    for (const text of [
      'date,name,amount\n2026-02-30,Food,-1',
      'date,name,amount\n2026-11-01,Food,abc',
      'date,name,amount\n2026-11-01,Food,1.234',
      'date,name,debit,credit\n2026-11-01,Food,10,20',
      'date,name,amount,currency\n2026-11-01,Food,10,USD',
      'date,name,amount,id\n2026-11-01,Food,10,A\n2026-11-02,Food,10,A',
      'date,name,amount\n2026-11-01,Food,-1\n2026-11-02,Broken',
      'date,name,amount',
    ]) expect(() => parseCsv(text)).toThrow();
  });
  it('rejects invalid dates and nonstandard money notation', () => {
    expect(parseDate('2024-02-29')).toBe('2024-02-29T00:00:00');
    expect(() => parseDate('2026-02-29')).toThrow();
    expect(() => parseDate('2026-11-13T25:00')).toThrow();
    expect(moneyMinor('(1,200.25)')).toBe(-120025);
    expect(() => moneyMinor('12,34')).toThrow();
  });
});

const line = (texts: string[], y: number): PdfCell[] => texts.map((text, i) => ({ text, x: i * 110 + 20, y }));
describe('PDF table reconstruction', () => {
  it('reads repeated table headers across pages', () => {
    const { table, text } = pdfTable([
      [...line(['Date', 'Name', 'Amount', 'Fee', 'Balance'], 700), ...line(['2026-11-01', 'Coffee', '-10', '0.50', '89.50'], 680)],
      [...line(['Date', 'Name', 'Amount', 'Fee', 'Balance'], 700), ...line(['2026-11-02', 'Salary', '100', '0', '189.50'], 680)],
    ]);
    const draft = rowsToDraft(table, text);
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows[0].amountMinor).toBe(-1000);
  });
  it('refuses numeric continuation lines that could conceal missing transactions', () => {
    expect(() => pdfTable([[...line(['Date', 'Name', 'Amount'], 700), ...line(['2026-11-01', 'Coffee', '-10'], 680), ...line(['wrapped amount', '20.00'], 660)]])).toThrow(/wraps/);
  });
  it('refuses a page of timestamped transactions without recognized headers', () => {
    expect(() => pdfTable([[...line(['2026-11-01 12:00', 'Coffee', '-10'], 700)]])).toThrow(/headers/);
  });
  it('suggests categories from MoMo payment types, references and the statement owner', () => {
    const owner = 'IMMANUEL JUSTICE MAC-ARTHUR';
    expect(categoryFor('TELECEL PUSH', 'OTHER NETWORKS IMMANUEL JUSTICE MACARTHUR,233201326474,Pay', -6, owner)).toBe('own-accounts');
    expect(categoryFor('INTEROPERABILITY PULL OVA', 'MOMO USER MAC-ARTHUR IMMANUEL JUSTICE from Consolidated Bank', 100, owner)).toBe('from-bank');
    expect(categoryFor('KELVIN MAC- ARTHUR', 'MOMO USER Bsh', 20, owner)).toBe('received');
    expect(categoryFor('VICKYWALA ENTERPRISE', 'CASH OUT NationalId--', -50, owner)).toBe('cash-out');
    expect(categoryFor('233559133863@ MTNONLINEAIRTIMEVENDOR', 'AIRTIME -', -2, owner)).toBe('airtime');
    expect(categoryFor('Debit.Inv2 .', 'DEBIT SportyBet', -20, owner)).toBe('betting');
    expect(categoryFor('CHRISTOPHER AKAADI', 'MOMO USER Waakye', -28, owner)).toBe('food');
    expect(categoryFor('DANIEL ADDO', 'MOMO USER Haircut', -70, owner)).toBe('personal-care');
    expect(categoryFor('QwikLoan OVA', 'DEBIT -', -653.39, owner)).toBe('loan-repayment');
    expect(categoryFor('MABEL FIADONU', 'MOMO USER Pay', -15, owner)).toBe('transfers');
    expect(categoryFor('Mastercard Issuer - International PURCHASE MASTERCARD', '', -120, owner)).toBe('shopping');
    expect(categoryFor('Mobile Money Service Charge 2153838600001 to PL52111', '', -0.1, owner)).toBe('charges');
  });
});
