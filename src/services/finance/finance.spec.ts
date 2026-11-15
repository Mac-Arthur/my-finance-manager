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

  it('unlocks combined totals after a possible transfer is confirmed', () => {
    const wallet = parseCsv('date,name,amount,balance\n2026-11-02,Wallet top up,100,600');
    wallet.account = 'MTN MoMo ••1111';
    wallet.rows[0].category = 'received';
    const bank = parseCsv('date,name,amount,balance\n2026-11-02,Wallet transfer,-100,900');
    bank.account = 'Test Bank ••2222';
    bank.rows[0].category = 'transfers';
    TestBed.inject(Statements).items.set([
      { id: 'wallet', name: 'wallet.csv', kind: 'csv', size: 1, addedAt: '2026-11-02', status: 'confirmed', file: new Blob(), draft: wallet },
      { id: 'bank', name: 'bank.csv', kind: 'csv', size: 1, addedAt: '2026-11-02', status: 'confirmed', file: new Blob(), draft: bank },
    ]);
    expect(finance.pendingTransferCandidates()).toHaveLength(1);
    expect(finance.canViewAllAccounts()).toBe(false);
    finance.confirmTransfer(finance.pendingTransferCandidates()[0].key);
    expect(finance.canViewAllAccounts()).toBe(true);
    finance.selectAccount(finance.allAccountsKey);
    expect(finance.viewingAllAccounts()).toBe(true);
    expect(finance.moneyIn()).toBe(0);
    expect(finance.moneyOut()).toBe(0);
    expect(finance.ownTransfers()).toHaveLength(1);
    expect(finance.statement.availableBalance).toBe(1500);
  });

  it('applies reversible one-off categories and teach-once counterparty rules', () => {
    const draft = parseCsv('date,name,amount,balance,id\n2026-11-01,Corner Shop,-10,90,A\n2026-11-02,Corner Shop,-20,70,B\n2026-11-03,Salary,100,170,C');
    draft.account = 'Test wallet';
    TestBed.inject(Statements).items.set([
      { id: 'test', name: 'test.csv', kind: 'csv', size: 1, addedAt: '2026-11-03', status: 'confirmed', file: new Blob(), draft },
    ]);
    const [salary, second, first] = finance.allTransactions();
    const importedCategory = first.category;

    expect(finance.setTransactionCategory(first.id, 'food', true)).toBe(true);
    expect(finance.allTransactions().filter(row => row.name === 'Corner Shop').map(row => row.category)).toEqual(['food', 'food']);
    expect(finance.categorySource(first.id)).toBe('transaction');
    expect(finance.categorySource(second.id)).toBe('rule');

    const rule = finance.categoryRuleFor(second.id)!;
    finance.removeCategoryRule(rule.key);
    expect(finance.allTransactions().find(row => row.id === second.id)?.category).toBe(importedCategory);
    expect(finance.allTransactions().find(row => row.id === first.id)?.category).toBe('food');
    finance.resetTransactionCategory(first.id);
    expect(finance.allTransactions().find(row => row.id === first.id)?.category).toBe(importedCategory);
    expect(finance.setTransactionCategory(salary.id, 'food')).toBe(false);

    expect(finance.moneyOut()).toBe(30);
    expect(finance.setTransactionCategory(first.id, 'own-accounts')).toBe(true);
    expect(finance.moneyOut()).toBe(20);
  });
});
