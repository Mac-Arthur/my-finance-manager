import { CATEGORIES } from '../../data/categories';
import { CategoryId, CurrencyCode, Transaction } from '../../models/finance';
import { backtestForecast, buildForecastModel, FLEXIBLE_CATEGORIES as FLEXIBLE, ForecastBacktest, ForecastModel, ForecastResult, simulateForecast } from './forecast';

export type ProjectionConfidence = 'low' | 'medium' | 'high';
export type ProjectionTone = 'good' | 'warning' | 'critical' | 'info';
export type ScenarioId = 'current' | 'better' | 'higher';

export interface ProjectionMonth {
  key: string;
  label: string;
  income: number;
  spending: number;
  flexible: number;
  fees: number;
  transactions: number;
}

export interface ProjectionScenario {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  description: string;
  monthlyIncome: number;
  monthlySpending: number;
  monthlyNet: number;
  projections: { days: 30 | 60 | 90; balance: number | null; cashFlow: number }[];
}

export interface ProjectionSignal {
  id: string;
  tone: ProjectionTone;
  title: string;
  body: string;
  value?: number;
  valueKind?: 'money' | 'percent' | 'number';
}

export interface RecurringCommitment {
  name: string;
  category: CategoryId;
  monthly: number;
  months: number;
}

export interface ProjectionReport {
  actions: { category: CategoryId; monthly: number; saving: number; target: number }[];
  currency: CurrencyCode;
  asOf: Date;
  months: ProjectionMonth[];
  monthsAnalyzed: number;
  confidence: ProjectionConfidence;
  confidenceReason: string;
  baselineIncome: number;
  baselineSpending: number;
  baselineFlexible: number;
  baselineFees: number;
  latestBalance: number | null;
  scenarios: ProjectionScenario[];
  signals: ProjectionSignal[];
  recurring: RecurringCommitment[];
  runwayDays: number | null;
  /** Day-by-day model: regular pay and bills on their dates plus replayed everyday activity. */
  model: ForecastModel;
  /** The latest 30 days checked against an estimate made without them. Null when history is too short. */
  backtest: ForecastBacktest | null;
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const normalizedName = (value: string) => value.toLowerCase().replace(/\d{4,}/g, '').replace(/[^a-z]+/g, ' ').trim();

function monthlyHistory(transactions: Transaction[], anchor: Date): ProjectionMonth[] {
  const anchorKey = monthKey(anchor);
  const buckets = new Map<string, ProjectionMonth>();
  for (const transaction of transactions) {
    const key = monthKey(transaction.date);
    if (key >= anchorKey || transaction.category === 'own-accounts') continue;
    const bucket = buckets.get(key) ?? {
      key,
      label: transaction.date.toLocaleDateString('en-GH', { month: 'short', year: '2-digit' }),
      income: 0,
      spending: 0,
      flexible: 0,
      fees: 0,
      transactions: 0,
    };
    bucket.transactions++;
    bucket.fees += transaction.fee;
    if (transaction.amount > 0 && transaction.category !== 'loan') bucket.income += transaction.amount;
    if (transaction.amount < 0) {
      const amount = Math.abs(transaction.amount);
      bucket.spending += amount;
      if (FLEXIBLE.has(transaction.category)) bucket.flexible += amount;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-6).map(month => ({ ...month, spending: month.spending + month.fees }));
}

function trailingMonth(transactions: Transaction[], anchor: Date): ProjectionMonth {
  const from = new Date(anchor);
  from.setDate(from.getDate() - 29);
  const rows = transactions.filter(transaction => transaction.date >= from && transaction.date <= anchor && transaction.category !== 'own-accounts');
  const fees = sum(rows.map(transaction => transaction.fee));
  return {
    key: 'recent-30',
    label: 'Recent 30 days',
    income: sum(rows.filter(transaction => transaction.amount > 0 && transaction.category !== 'loan').map(transaction => transaction.amount)),
    spending: sum(rows.filter(transaction => transaction.amount < 0).map(transaction => Math.abs(transaction.amount))) + fees,
    flexible: sum(rows.filter(transaction => transaction.amount < 0 && FLEXIBLE.has(transaction.category)).map(transaction => Math.abs(transaction.amount))),
    fees,
    transactions: rows.length,
  };
}

function recurringCommitments(transactions: Transaction[], anchor: Date): RecurringCommitment[] {
  const groups = new Map<string, { name: string; category: CategoryId; months: Map<string, number> }>();
  for (const transaction of transactions) {
    if (transaction.date > anchor || transaction.amount >= 0 || transaction.category === 'own-accounts' || transaction.category === 'cash-out') continue;
    const key = normalizedName(transaction.name);
    if (key.length < 3) continue;
    const group = groups.get(key) ?? { name: transaction.name, category: transaction.category, months: new Map() };
    const month = monthKey(transaction.date);
    group.months.set(month, (group.months.get(month) ?? 0) + Math.abs(transaction.amount) + transaction.fee);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(group => {
    const values = [...group.months.values()];
    if (values.length < 2) return [];
    const typical = median(values);
    const stable = typical > 0 && values.every(value => Math.abs(value - typical) / typical <= .35);
    return stable ? [{ name: group.name, category: group.category, monthly: typical, months: values.length }] : [];
  }).sort((a, b) => b.monthly - a.monthly).slice(0, 6);
}

function scenario(id: ScenarioId, income: number, spending: number, flexible: number, latestBalance: number | null, forecast: ForecastResult): ProjectionScenario {
  const definitions: Record<ScenarioId, { label: string; shortLabel: string; description: string; adjustedSpending: number }> = {
    current: { label: 'Current pace', shortLabel: 'Current', description: 'Recent income and spending continue at their typical pace.', adjustedSpending: spending },
    better: { label: 'Trim everyday spending', shortLabel: 'Spend less', description: 'Try spending 10% less on selected everyday categories. Income, bills and repayments stay unchanged. Check which reductions are realistic for you.', adjustedSpending: Math.max(0, spending - flexible * .1) },
    higher: { label: 'Spend 10% more', shortLabel: 'Higher spend', description: 'Total spending rises by 10%; income stays the same.', adjustedSpending: spending * 1.1 },
  };
  const definition = definitions[id];
  const monthlyNet = income - definition.adjustedSpending;
  return {
    id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    description: definition.description,
    monthlyIncome: income,
    monthlySpending: definition.adjustedSpending,
    monthlyNet,
    projections: ([30, 60, 90] as const).map(days => ({
      days,
      balance: latestBalance === null ? null : forecast.days[days].mid,
      cashFlow: forecast.days[days].mid - (latestBalance ?? 0),
    })),
  };
}

export function buildProjectionReport(transactions: Transaction[], latestBalance: number | null): ProjectionReport | null {
  if (!transactions.length) return null;
  const rows = [...transactions].sort((a, b) => +a.date - +b.date);
  const asOf = rows.at(-1)!.date;
  const currency = rows[0].currency;
  const closedMonths = monthlyHistory(rows, asOf);
  const months = closedMonths.length ? closedMonths : [trailingMonth(rows, asOf)];
  const baselineIncome = median(months.map(month => month.income));
  const baselineSpending = median(months.map(month => month.spending));
  const baselineFlexible = median(months.map(month => month.flexible));
  const baselineFees = median(months.map(month => month.fees));
  const model = buildForecastModel(rows, asOf);
  const backtest = backtestForecast(rows, asOf);
  const confidence: ProjectionConfidence = closedMonths.length < 2 ? 'low'
    : closedMonths.length >= 5 && backtest?.within && model.quietDays < 30 ? 'high' : 'medium';
  const confidenceReason = (confidence === 'high'
      ? `${closedMonths.length} imported calendar months show a steady pattern, and the latest 30 days landed inside the range estimated without them.`
      : confidence === 'medium'
        ? `${closedMonths.length} imported calendar months provide an early pattern. Missing transactions or partial months can change the result.`
        : closedMonths.length === 1
          ? 'Only one earlier calendar month is available. Treat this as an early estimate.'
          : 'This uses available activity within the last 30 days of your statement, which may cover fewer days. It is not yet a reliable monthly pattern.')
    + (model.quietDays >= 30 ? ` There is a ${model.quietDays}-day stretch with no activity. If a statement is missing, import it.` : '');
  const forecasts = {
    current: simulateForecast(model, { start: latestBalance }),
    better: simulateForecast(model, { start: latestBalance, trim: .1 }),
    higher: simulateForecast(model, { start: latestBalance, growth: .1 }),
  };
  const scenarios = (['current', 'better', 'higher'] as const).map(id => scenario(id, baselineIncome, baselineSpending, baselineFlexible, latestBalance, forecasts[id]));
  const currentNet = scenarios[0].monthlyNet;
  const linearRunway = latestBalance !== null && latestBalance > 0 && currentNet < 0 ? Math.max(1, Math.floor(latestBalance / (-currentNet / 30))) : null;
  const runwayDays = forecasts.current.zeroDay ?? linearRunway;
  const recurring = recurringCommitments(rows, asOf);
  const outflows = rows.filter(transaction => transaction.amount < 0 && transaction.category !== 'own-accounts');
  const fees = sum(rows.map(transaction => transaction.fee)) + sum(outflows.filter(transaction => transaction.category === 'charges').map(transaction => Math.abs(transaction.amount)));
  const totalOut = sum(outflows.map(transaction => Math.abs(transaction.amount))) + sum(rows.map(transaction => transaction.fee));
  const categories = new Map<CategoryId, number>();
  for (const transaction of outflows) categories.set(transaction.category, (categories.get(transaction.category) ?? 0) + Math.abs(transaction.amount));
  const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  const latestMonth = closedMonths.at(-1);
  const previousMonth = closedMonths.at(-2);
  const loanCount = rows.filter(transaction => transaction.category === 'loan' || transaction.category === 'loan-repayment').length;
  const bettingTotal = sum(outflows.filter(transaction => transaction.category === 'betting').map(transaction => Math.abs(transaction.amount)));
  const signals: ProjectionSignal[] = [];

  signals.push(currentNet >= 0
    ? { id: 'cash-flow', tone: 'good', title: 'Income covers the spending shown', body: 'If this pattern continues, this is what could remain each month. Keep upcoming bills covered before treating it as money to spend.', value: currentNet, valueKind: 'money' }
    : { id: 'cash-flow', tone: 'critical', title: 'Spending is ahead of typical income', body: 'If the recent pattern continues, the imported balance may keep falling.', value: currentNet, valueKind: 'money' });
  if (runwayDays !== null) signals.push({ id: 'runway', tone: runwayDays < 45 ? 'critical' : 'warning', title: `The recorded balance could last about ${runwayDays} days`, body: currentNet >= 0 ? 'Counted from your latest statement date. Regular money in is expected after that, so this is a timing gap before it arrives rather than a monthly shortfall.' : 'Counted from your latest statement date if money keeps leaving faster than it comes in. Actual bill and pay dates may bring the balance down sooner.', value: runwayDays, valueKind: 'number' });
  const shortDate = (date: Date) => date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
  const { dipShare, lowest } = forecasts.current;
  if (runwayDays === null && dipShare !== null && dipShare >= .2 && lowest.day > 0) signals.push({ id: 'tight', tone: dipShare >= .5 ? 'critical' : 'warning', title: `Money could get tight around ${shortDate(lowest.date)}`, body: `We replayed your past days many times. About ${Math.max(1, Math.round(dipShare * 10))} in 10 replays dipped below zero within 90 days. The amount shown is the lowest point of the middle estimate.`, value: lowest.mid, valueKind: 'money' });
  const payFlows = model.flows.filter(flow => flow.direction === 'in');
  if (payFlows.length) signals.push({ id: 'pay-rhythm', tone: 'good', title: `${payFlows.length} regular money-in ${payFlows.length === 1 ? 'pattern' : 'patterns'} found`, body: `The next one is expected around ${shortDate(payFlows[0].nextDate)}. Regular money in is placed on its expected dates in the 90-day path.`, value: sum(payFlows.map(flow => flow.amount)), valueKind: 'money' });
  else if (baselineIncome > 0) signals.push({ id: 'pay-rhythm', tone: 'info', title: 'Money in arrives without a fixed rhythm', body: 'No steady payday was found, so the range around the 90-day path is wider. More months of history may reveal one.' });
  const peak = model.weekdayOut.indexOf(Math.max(...model.weekdayOut));
  if (model.historyDays >= 56 && model.dailyOut > 0 && model.weekdayOut[peak] >= model.dailyOut * 1.5) signals.push({ id: 'weekday', tone: 'info', title: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peak]}s are your biggest spending days`, body: 'Average everyday spending on that day of the week, regular bills left out. Planning ahead for it can smooth the week.', value: model.weekdayOut[peak], valueKind: 'money' });
  if (latestMonth && previousMonth) {
    const change = previousMonth.spending ? (latestMonth.spending - previousMonth.spending) / previousMonth.spending : 0;
    if (previousMonth.spending > 0) signals.push({ id: 'trend', tone: change > .1 ? 'warning' : change < -.1 ? 'good' : 'info', title: change > .1 ? 'Spending rose in the latest imported month' : change < -.1 ? 'Spending eased in the latest imported month' : 'Monthly spending is relatively steady', body: `${latestMonth.label} compared with ${previousMonth.label}. Check that both months have complete imports before treating this as a change in habits.`, value: change, valueKind: 'percent' });
  }
  if (topCategory) {
    const share = totalOut ? topCategory[1] / totalOut : 0;
    signals.push({ id: 'category', tone: share >= .35 ? 'warning' : 'info', title: `${CATEGORIES[topCategory[0]].label} leads spending`, body: 'This is the largest outgoing category across the imported history for this account.', value: share, valueKind: 'percent' });
  }
  signals.push(fees > 0
    ? { id: 'fees', tone: fees / Math.max(totalOut, 1) >= .05 ? 'warning' : 'info', title: 'Fees and charges are taking a share', body: 'Includes transaction fees and rows categorised as charges.', value: fees / Math.max(totalOut, 1), valueKind: 'percent' }
    : { id: 'fees', tone: 'good', title: 'No fees were captured', body: 'The imported rows do not currently show transaction fees or charge entries.' });
  signals.push(recurring.length
    ? { id: 'recurring', tone: 'info', title: `${recurring.length} repeat ${recurring.length === 1 ? 'payment pattern' : 'payment patterns'} found`, body: 'These counterparties appeared with similar outgoing totals in at least two months.', value: sum(recurring.map(item => item.monthly)), valueKind: 'money' }
    : { id: 'recurring', tone: 'info', title: 'No stable repeat payments yet', body: 'More imported months may reveal subscriptions, bills or other regular commitments.' });
  if (loanCount) signals.push({ id: 'loans', tone: 'warning', title: 'Keep repayments in your plan', body: 'Set aside repayment money before optional purchases. Borrowed money is excluded from normal income in these estimates.', value: loanCount, valueKind: 'number' });
  if (bettingTotal > 0) signals.push({ id: 'betting', tone: 'warning', title: 'Review money going to betting', body: 'This is the amount categorised as betting in your imported history. Consider reducing it or pausing it; do not depend on winnings to cover bills.', value: bettingTotal, valueKind: 'money' });

  const actions = [...FLEXIBLE].map(category => {
    const totals = months.map(month => sum(rows.filter(row => row.amount < 0 && row.category === category &&
      (month.key === 'recent-30' ? +row.date >= +asOf - 29 * 86400000 : monthKey(row.date) === month.key))
      .map(row => Math.abs(row.amount))));
    const monthly = median(totals);
    const saving = Math.round(monthly * .1 * 100) / 100;
    return { category, monthly, saving, target: monthly - saving };
  }).filter(action => action.saving > 0).sort((a, b) => b.saving - a.saving).slice(0, 3);

  return {
    actions,
    currency,
    asOf,
    months,
    monthsAnalyzed: closedMonths.length,
    confidence,
    confidenceReason,
    baselineIncome,
    baselineSpending,
    baselineFlexible,
    baselineFees,
    latestBalance,
    scenarios,
    signals: signals.slice(0, 10),
    recurring,
    runwayDays,
    model,
    backtest,
  };
}
