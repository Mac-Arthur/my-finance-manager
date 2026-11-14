import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Finance } from './finance';
import { Statements } from '../statements/statements';
import { parseCsv } from '../analysis/parse-statement';

describe('Finance without demo data', () => {
  let finance: Finance;
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    TestBed.configureTestingModule({});
    finance = TestBed.inject(Finance);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts without transactions, budgets, goals or invented insights', () => {
    expect(finance.hasData()).toBe(false);
    expect(finance.allTransactions()).toEqual([]);
    expect(finance.budgets()).toEqual([]);
    expect(finance.goal().saved).toBe(0);
    expect(finance.goal().target).toBe(0);
    expect(finance.insights()).toEqual([]);
    expect(finance.daily()).toEqual([]);
    expect(finance.periodDays).toBe(0);
    expect(finance.avgDailySpend()).toBe(0);
  });

  it('filters reviewed transactions at a calendar boundary', () => {
    const draft = parseCsv('date,name,amount,fee,balance\n2026-10-31T23:59,Test recipient,-10,0,90\n2026-11-01T00:01,Test recipient,-10,0,80');
    draft.account = 'Test wallet';
    TestBed.inject(Statements).items.set([{ id: 'test', name: 'test.csv', kind: 'csv', size: 1, addedAt: '2026-11-01', status: 'confirmed', file: new Blob(), draft }]);
    finance.selectedRange.set({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59, 59, 999) });
    expect(finance.transactions().length).toBe(1);
    expect(finance.moneyOut()).toBe(10);
    expect(finance.periodDays).toBe(1);
    expect(finance.daily()[0].spent).toBe(10);
  });

  it('keeps account totals separate and switches the active ledger', () => {
    const wallet = parseCsv('date,name,amount,balance\n2026-11-01,Wallet purchase,-10,90');
    wallet.account = 'MTN MoMo ••1111';
    const bank = parseCsv('date,name,amount,balance\n2026-11-02,Bank purchase,-25,975');
    bank.account = 'Test Bank ••2222';
    TestBed.inject(Statements).items.set([
      { id: 'wallet', name: 'wallet.csv', kind: 'csv', size: 1, addedAt: '2026-11-01', status: 'confirmed', file: new Blob(), draft: wallet },
      { id: 'bank', name: 'bank.csv', kind: 'csv', size: 1, addedAt: '2026-11-02', status: 'confirmed', file: new Blob(), draft: bank },
    ]);
    expect(finance.accounts()).toHaveLength(2);
    expect(finance.activeAccount()?.label).toBe('Test Bank ••2222');
    expect(finance.moneyOut()).toBe(25);
    finance.selectAccount('mtn momo ••1111');
    expect(finance.moneyOut()).toBe(10);
    expect(finance.statement.availableBalance).toBe(90);
  });
});
