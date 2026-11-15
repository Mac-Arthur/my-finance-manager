import { Transaction } from '../../models/finance';
import { applyCategoryCorrections, categoryRuleKey, counterpartyKey } from './category-corrections';

const transaction = (id: string, name: string, amount: number): Transaction => ({
  id, name, amount, account: 'Wallet', accountKey: 'wallet', date: new Date('2026-11-01'), type: 'Imported',
  fee: 0, balance: null, reference: '', channel: 'momo', category: amount > 0 ? 'received' : 'transfers',
});

describe('Category corrections', () => {
  it('normalizes counterparty whitespace and casing while keeping money directions separate', () => {
    expect(counterpartyKey('  Kojo   Store ')).toBe('kojo store');
    expect(categoryRuleKey('Kojo Store', 'in')).not.toBe(categoryRuleKey('Kojo Store', 'out'));
  });

  it('applies a counterparty rule and lets a one-off correction win', () => {
    const rows = [transaction('one', 'Kojo Store', -20), transaction('two', ' KOJO  STORE ', -30), transaction('three', 'Kojo Store', 50)];
    const result = applyCategoryCorrections(rows, {
      overrides: { two: 'giving' },
      rules: [{ key: categoryRuleKey('Kojo Store', 'out'), counterparty: 'Kojo Store', direction: 'out', category: 'food' }],
    });
    expect(result.map(row => row.category)).toEqual(['food', 'giving', 'received']);
    expect(rows.map(row => row.category)).toEqual(['transfers', 'transfers', 'received']);
  });
});
