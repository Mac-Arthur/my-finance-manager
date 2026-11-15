import { CategoryId, CurrencyCode, Transaction } from '../../models/finance';
import { buildProjectionReport } from './projections';

function transaction(id: string, date: string, amount: number, category: CategoryId, name = 'Merchant', fee = 0, currency: CurrencyCode = 'GHS'): Transaction {
  return { id, date: new Date(date), amount, category, name, fee, currency, account: 'Wallet', accountKey: 'wallet', type: 'Imported', balance: null, reference: '', channel: 'momo' };
}

describe('Local account projections', () => {
  it('only includes betting advice for accounts with betting outflows', () => {
    const ordinary = [transaction('pay', '2026-01-01', 1000, 'received'), transaction('food', '2026-01-10', -200, 'food'), transaction('next', '2026-02-01', -10, 'food')];
    const withBetting = buildProjectionReport([...ordinary, transaction('bet', '2026-01-15', -50, 'betting')], 500)!;
    expect(withBetting.signals.some(signal => signal.id === 'betting')).toBe(true);
    const withoutBetting = buildProjectionReport(ordinary, 500)!;
    expect(JSON.stringify(withoutBetting)).not.toMatch(/betting/i);
    expect(withoutBetting.signals.some(signal => signal.id === 'loans')).toBe(false);
    expect(buildProjectionReport([...ordinary, transaction('refund', '2026-01-15', 50, 'betting')], 500)!.signals.some(signal => signal.id === 'betting')).toBe(false);
  });

  it('makes realistic category examples without treating cash withdrawals as optional spending', () => {
    const report = buildProjectionReport([
      transaction('food', '2026-01-10', -200, 'food'),
      transaction('cash', '2026-01-11', -1000, 'cash-out'),
      transaction('transfer', '2026-01-12', -500, 'transfers'),
      transaction('next', '2026-02-01', -10, 'food'),
    ], 500)!;
    expect(report.actions).toEqual([{ category: 'food', monthly: 200, saving: 20, target: 180 }]);
    expect(report.scenarios[1].monthlySpending).toBe(1680);
    expect(report.confidence).toBe('low');
  });

  it('builds three explainable scenarios from closed months and excludes loans from normal income', () => {
    const rows = [
      transaction('jan-income', '2026-01-05', 1000, 'received', 'Salary'),
      transaction('jan-food', '2026-01-10', -400, 'food', 'Food'),
      transaction('feb-income', '2026-02-05', 1200, 'received', 'Salary'),
      transaction('feb-food', '2026-02-10', -500, 'food', 'Food'),
      transaction('feb-loan', '2026-02-15', 5000, 'loan', 'Loan'),
      transaction('mar-current', '2026-03-03', -20, 'transport', 'Ride'),
    ];
    const report = buildProjectionReport(rows, 2000)!;
    expect(report.monthsAnalyzed).toBe(2);
    expect(report.confidence).toBe('medium');
    expect(report.baselineIncome).toBe(1100);
    expect(report.baselineSpending).toBe(450);
    expect(report.scenarios).toHaveLength(3);
    expect(report.scenarios[1].monthlySpending).toBeLessThan(report.scenarios[0].monthlySpending);
    expect(report.scenarios[2].monthlySpending).toBeGreaterThan(report.scenarios[0].monthlySpending);
    expect(report.signals.length).toBeGreaterThanOrEqual(5);
  });

  it('does not count own-account transfers and detects stable repeat payments', () => {
    const rows = [
      transaction('jan-income', '2026-01-02', 1000, 'received'),
      transaction('jan-bill', '2026-01-10', -100, 'bills', 'Internet'),
      transaction('jan-own', '2026-01-12', -800, 'own-accounts', 'My bank'),
      transaction('feb-income', '2026-02-02', 1000, 'received'),
      transaction('feb-bill', '2026-02-10', -105, 'bills', 'Internet'),
      transaction('mar-current', '2026-03-02', -10, 'food'),
    ];
    const report = buildProjectionReport(rows, 500)!;
    expect(report.baselineSpending).toBe(102.5);
    expect(report.recurring).toMatchObject([{ name: 'Internet', months: 2, monthly: 102.5 }]);
  });

  it('falls back to a clearly low-confidence recent window when history is short', () => {
    const rows = [transaction('one', '2026-03-01', 500, 'received'), transaction('two', '2026-03-10', -100, 'food')];
    const report = buildProjectionReport(rows, null)!;
    expect(report.confidence).toBe('low');
    expect(report.monthsAnalyzed).toBe(0);
    expect(report.scenarios[0].projections[0].balance).toBeNull();
  });
});
