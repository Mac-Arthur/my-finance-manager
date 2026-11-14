import { assertCompatible, ledgerTransactions } from './ledger';
import { parseCsv } from './parse-statement';

const draft = (text: string) => ({ ...parseCsv(text), account: 'My wallet' });
describe('Reviewed ledger', () => {
  it('counts overlapping provider IDs once and preserves them when one source is removed', () => {
    const a = { id: 'a', draft: draft('date,name,amount,id\n2026-11-01,Food,-10,A') };
    const b = { id: 'b', draft: draft('date,name,amount,id\n2026-11-01,Food,-10,A\n2026-11-02,Food,-10,B') };
    expect(() => assertCompatible(b.draft, [a])).not.toThrow();
    expect(ledgerTransactions([a, b])).toHaveLength(2);
    expect(ledgerTransactions([b])).toHaveLength(2);
  });
  it('keeps genuine repeated transactions without IDs inside one source', () => {
    const a = { id: 'a', draft: draft('date,name,amount\n2026-11-01,Food,-10\n2026-11-01,Food,-10') };
    expect(ledgerTransactions([a])).toHaveLength(2);
    expect(() => assertCompatible(a.draft, [a])).toThrow(/Overlapping/);
  });
  it('rejects conflicting transaction IDs', () => {
    const a = { id: 'a', draft: draft('date,name,amount,id\n2026-11-01,Food,-10,A') };
    const b = draft('date,name,amount,id\n2026-11-01,Food,-20,A');
    expect(() => assertCompatible(b, [a])).toThrow(/conflicts/);
  });
  it('keeps separate accounts independent even when provider IDs overlap', () => {
    const wallet = { id: 'wallet', draft: draft('date,name,amount,id\n2026-11-01,Food,-10,A') };
    const bankDraft = draft('date,name,amount,id\n2026-11-01,Food,-20,A');
    bankDraft.account = 'My bank ••1234';
    expect(() => assertCompatible(bankDraft, [wallet])).not.toThrow();
    const rows = ledgerTransactions([wallet, { id: 'bank', draft: bankDraft }]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.account))).toEqual(new Set(['My wallet', 'My bank ••1234']));
  });
});
