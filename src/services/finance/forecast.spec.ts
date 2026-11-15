import { CategoryId, Transaction } from '../../models/finance';
import { backtestForecast, buildForecastModel, safeToSpend, simulateForecast } from './forecast';

let seq = 0;
function row(date: string, amount: number, category: CategoryId, name = 'Merchant', fee = 0): Transaction {
  return { id: `t${seq++}`, date: new Date(`${date}T10:00:00`), amount, category, name, fee, currency: 'GHS', account: 'Wallet', accountKey: 'wallet', type: 'Imported', balance: null, reference: '', channel: 'momo' };
}
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Salary on the 25th, rent on the 2nd, and 40 of food every day from 1 Jan to `end`. */
function steadyHistory(end = '2026-04-10'): Transaction[] {
  const rows: Transaction[] = [];
  for (const day = new Date('2026-01-01T10:00:00'); iso(day) <= end; day.setDate(day.getDate() + 1)) {
    rows.push(row(iso(day), -40, 'food', 'Chop bar'));
    if (day.getDate() === 25) rows.push(row(iso(day), 3000, 'received', `ACME SALARY ${day.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()} 2026`));
    if (day.getDate() === 2) rows.push(row(iso(day), -800, 'transfers', 'Landlord Mensah'));
  }
  return rows;
}

describe('Day-by-day forecast model', () => {
  it('finds regular pay and bills and places them on their next expected dates', () => {
    const model = buildForecastModel(steadyHistory(), new Date('2026-04-10'));
    expect(model.flows.map(flow => [flow.direction, flow.cadence, flow.amount, iso(flow.nextDate), flow.occurrences])).toEqual([
      ['in', 'monthly', 3000, '2026-04-25', 3],
      ['out', 'monthly', 800, '2026-05-02', 4],
    ]);
    // Daily food has no weekly/monthly gap, so it stays everyday spending rather than a "bill".
    expect(model.dailyOut).toBe(40);
    expect(model.dailyIn).toBe(0);
    expect(model.events.filter(event => event.direction === 'in').map(event => iso(event.date))).toEqual(['2026-04-25', '2026-05-25', '2026-06-25']);
  });

  it('follows the timing of money, not just a monthly average', () => {
    const model = buildForecastModel(steadyHistory(), new Date('2026-04-10'));
    const result = simulateForecast(model, { start: 500 });
    // 500 − 40/day runs out on day 13, before pay on day 15, even though the month as a whole is positive.
    expect(result.zeroDay).toBe(13);
    expect(result.lowest.day).toBe(14);
    expect(result.lowest.mid).toBe(-60);
    expect(result.days[15].mid).toBe(2900);
    expect(result.days[90].mid).toBeGreaterThan(500);
    expect(result.dipShare).toBe(1);
  });

  it('is repeatable and keeps low ≤ middle ≤ high', () => {
    const rows = [...steadyHistory(), row('2026-03-07', -300, 'shopping', 'Market'), row('2026-03-20', 150, 'received', 'Kofi'), row('2026-04-04', -220, 'betting', 'Bet shop')];
    const model = buildForecastModel(rows, new Date('2026-04-10'));
    const first = simulateForecast(model, { start: 1000 });
    expect(simulateForecast(model, { start: 1000 })).toEqual(first);
    expect(first.days).toHaveLength(91);
    expect(first.days.every(day => day.low <= day.mid && day.mid <= day.high)).toBe(true);
    expect(first.days[90].high).toBeGreaterThan(first.days[90].low);
  });

  it('applies scenario changes and lets a regular item be left out', () => {
    const model = buildForecastModel(steadyHistory(), new Date('2026-04-10'));
    const base = simulateForecast(model, { start: 1000 }).days[90].mid;
    // Food is flexible: 10% of 40 for 90 days. Rent is not trimmed.
    expect(simulateForecast(model, { start: 1000, trim: .1 }).days[90].mid).toBeCloseTo(base + 360, 2);
    // 10% more on everything: food (360) plus three rents (240).
    expect(simulateForecast(model, { start: 1000, growth: .1 }).days[90].mid).toBeCloseTo(base - 600, 2);
    const salary = model.flows.find(flow => flow.direction === 'in')!;
    expect(simulateForecast(model, { start: 1000, excluded: new Set([salary.id]) }).days[90].mid).toBeCloseTo(base - 9000, 2);
    expect(simulateForecast(model).dipShare).toBeNull();
  });

  it('ignores own-account moves, does not treat loans as income, and skips lapsed patterns', () => {
    const rows = [
      ...steadyHistory('2026-03-31'),
      row('2026-03-05', -2000, 'own-accounts', 'My bank'),
      row('2026-03-06', 1000, 'loan', 'QwikLoan'),
      row('2025-10-01', -50, 'bills', 'Old TV plan'), row('2025-11-01', -50, 'bills', 'Old TV plan'), row('2025-12-01', -50, 'bills', 'Old TV plan'),
    ];
    const model = buildForecastModel(rows, new Date('2026-03-31'));
    expect(model.dailyIn).toBe(0);
    expect(model.dailyOut).toBe(40);
    expect(model.flows.some(flow => /tv plan/i.test(flow.name))).toBe(false);
  });

  it('marks a regular payment that has not shown up yet as due next', () => {
    const rows = steadyHistory('2026-04-10').filter(item => !(item.name === 'Landlord Mensah' && iso(item.date) === '2026-04-02'));
    const rent = buildForecastModel(rows, new Date('2026-04-10')).flows.find(flow => flow.direction === 'out')!;
    expect(rent.overdue).toBe(true);
    expect(iso(rent.nextDate)).toBe('2026-04-11');
  });

  it('works out a daily amount that lasts until the next regular income', () => {
    const model = buildForecastModel(steadyHistory('2026-04-28'), new Date('2026-04-28'));
    // Next pay 25 May (27 days away); rent of 800 falls due on 2 May.
    expect(safeToSpend(model, 2150)).toMatchObject({ days: 27, committed: 800, committedCount: 1, perDay: 50, typicalDaily: 40 });
    expect(safeToSpend(model, 300)!.perDay).toBe(0);
    expect(safeToSpend(model, null)).toBeNull();
    const rent = model.flows.find(flow => flow.direction === 'out')!;
    expect(safeToSpend(model, 2150, new Set([rent.id]))).toMatchObject({ committed: 0, perDay: 79.63 });
    // No regular income found: fall back to a plain 30 days.
    const irregular = buildForecastModel([row('2026-04-01', 500, 'received', 'Ama'), row('2026-04-20', -30, 'food')], new Date('2026-04-20'));
    expect(safeToSpend(irregular, 600)).toMatchObject({ days: 30, perDay: 20, payName: null });
  });

  it('checks itself against the latest 30 days when there is enough earlier history', () => {
    expect(backtestForecast(steadyHistory('2026-02-20'), new Date('2026-02-20'))).toBeNull();
    const check = backtestForecast(steadyHistory(), new Date('2026-04-10'))!;
    // 11 Mar – 10 Apr really had: 30 days of food, one salary, one rent.
    expect(check.actual).toBe(-1200 + 3000 - 800);
    expect(check.mid).toBe(check.actual);
    expect(check.within).toBe(true);
  });
});
