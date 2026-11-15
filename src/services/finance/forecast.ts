import { CategoryId, Transaction } from '../../models/finance';

/**
 * Day-by-day cash-flow model behind /outlook. Pure and local.
 *
 * 1. Regular money in and out (same counterparty, steady gap, steady amount) is placed on its expected dates.
 * 2. Everything else is "everyday" activity. Future days are filled by replaying real past days
 *    (same weekday when there are enough of them) many times with a fixed seed, so results are repeatable.
 * 3. The middle of those replays is the estimate; the 10th–90th percentile is the range.
 *
 * Own-account transfers are ignored and borrowed money is not income. Repayments stay as spending.
 */

export const FLEXIBLE_CATEGORIES: ReadonlySet<CategoryId> = new Set<CategoryId>(['transport', 'food', 'betting', 'airtime', 'shopping', 'giving', 'personal-care']);

export type Cadence = 'weekly' | 'fortnightly' | 'monthly';

export interface RecurringFlow {
  id: string;
  name: string;
  category: CategoryId;
  direction: 'in' | 'out';
  cadence: Cadence;
  /** Typical amount, always positive. Outgoing amounts include fees. */
  amount: number;
  occurrences: number;
  lastDate: Date;
  nextDate: Date;
  /** Expected before the statement date but not seen, so it is placed on the next day. */
  overdue: boolean;
}

export interface ExpectedEvent {
  flowId: string;
  direction: 'in' | 'out';
  amount: number;
  /** Days after the statement date. */
  day: number;
  date: Date;
}

interface PoolDay { income: number; flexible: number; other: number }

export interface ForecastModel {
  asOf: Date;
  asOfDay: number;
  /** Days between the first and last imported transaction, inclusive. */
  historyDays: number;
  /** Longest stretch with no activity at all. A long one can mean a missing statement. */
  quietDays: number;
  flows: RecurringFlow[];
  events: ExpectedEvent[];
  pool: PoolDay[];
  byWeekday: PoolDay[][];
  /** Everyday (non-regular) averages per day across the replay window. */
  dailyIn: number;
  dailyOut: number;
  /** Average everyday spending for each weekday, Sunday first. */
  weekdayOut: number[];
}

export interface ForecastOptions {
  /** Starting balance. Without one, values are money gained or used since the statement date. */
  start?: number | null;
  /** Share cut from flexible everyday spending, 0–1. */
  trim?: number;
  /** Share added to all spending, 0–1. */
  growth?: number;
  /** Regular flows the user chose to leave out. */
  excluded?: ReadonlySet<string>;
  horizon?: number;
}

export interface ForecastDay { day: number; date: Date; low: number; mid: number; high: number }

export interface ForecastResult {
  days: ForecastDay[];
  lowest: ForecastDay;
  /** First day the middle estimate goes below zero. Needs a positive starting balance. */
  zeroDay: number | null;
  /** Share of replays that went below zero at some point. Needs a starting balance. */
  dipShare: number | null;
}

export interface SafeToSpend {
  perDay: number;
  days: number;
  until: Date;
  /** Regular payments expected on or before `until`. */
  committed: number;
  committedCount: number;
  /** Name of the regular income this runs up to, if one was found. */
  payName: string | null;
  typicalDaily: number;
}

export interface ForecastBacktest {
  days: number;
  actual: number;
  low: number;
  mid: number;
  high: number;
  within: boolean;
}

const DAY = 86400000;
const PATHS = 400;
const SEED = 0x5eed1e;
const WINDOW = 90;
const HORIZON = 90;
const CADENCES: { id: Cadence; min: number; max: number; need: number }[] = [
  { id: 'weekly', min: 5, max: 9, need: 4 },
  { id: 'fortnightly', min: 11, max: 17, need: 3 },
  { id: 'monthly', min: 24, max: 37, need: 2 },
];
const MONTH_WORDS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;
const NONE: ReadonlySet<string> = new Set();

export const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
export const dayDate = (day: number) => {
  const utc = new Date(day * DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
};
const weekdayOf = (day: number) => (((day + 4) % 7) + 7) % 7;
const round = (value: number) => Math.round(value * 100) / 100;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
/** "SALARY NOV 2026" and "SALARY DEC 2026" are the same payer. */
const flowName = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, ' ').replace(MONTH_WORDS, ' ').replace(/\s+/g, ' ').trim();

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Money this row adds to (+) or takes from (−) the account for planning purposes. */
function netOf(row: Transaction): number {
  if (row.category === 'own-accounts') return 0;
  if (row.amount > 0) return (row.category === 'loan' ? 0 : row.amount) - row.fee;
  return row.amount - row.fee;
}

function nextDates(days: number[], cadence: Cadence, asOfDay: number): { days: number[]; overdue: boolean } {
  const last = days.at(-1)!;
  const upcoming: number[] = [];
  if (cadence !== 'monthly') {
    const step = cadence === 'weekly' ? 7 : 14;
    for (let day = last + step; day <= asOfDay + HORIZON; day += step) upcoming.push(day);
  } else {
    const lastDate = dayDate(last);
    const doms = days.map(day => dayDate(day).getDate());
    // Dates that straddle a month end (31st, 1st, 30th) have no useful middle; follow the latest one.
    const dom = Math.max(...doms) - Math.min(...doms) <= 10 ? Math.round(median(doms)) : lastDate.getDate();
    // A payment that slipped into the neighbouring month still belongs to its usual month.
    const slip = lastDate.getDate() < dom - 15 ? -1 : lastDate.getDate() > dom + 15 ? 1 : 0;
    for (let k = 1; k <= 5; k++) {
      const month = lastDate.getMonth() + slip + k;
      const length = new Date(lastDate.getFullYear(), month + 1, 0).getDate();
      const day = dayNumber(new Date(lastDate.getFullYear(), month, Math.min(dom, length)));
      if (day > last + 10 && day <= asOfDay + HORIZON) upcoming.push(day);
    }
  }
  const future = upcoming.filter(day => day > asOfDay);
  const overdue = upcoming.length > future.length;
  if (overdue && future[0] !== asOfDay + 1) future.unshift(asOfDay + 1);
  return { days: future, overdue };
}

export function buildForecastModel(transactions: Transaction[], asOf: Date): ForecastModel {
  const asOfDay = dayNumber(asOf);
  const rows = transactions.filter(row => dayNumber(row.date) <= asOfDay).sort((a, b) => +a.date - +b.date);
  const firstDay = rows.length ? dayNumber(rows[0].date) : asOfDay;

  let quietDays = 0;
  for (let i = 1; i < rows.length; i++) quietDays = Math.max(quietDays, dayNumber(rows[i].date) - dayNumber(rows[i - 1].date) - 1);

  // ---- Regular flows: same counterparty and direction, steady gap, steady amount, still active.
  const groups = new Map<string, { name: string; category: CategoryId; direction: 'in' | 'out'; days: Map<number, number>; ids: string[] }>();
  for (const row of rows) {
    if (row.category === 'own-accounts' || row.amount === 0) continue;
    const direction = row.amount > 0 ? 'in' : 'out';
    if (direction === 'in' ? row.category === 'loan' : row.category === 'cash-out') continue;
    const name = flowName(row.name);
    if (name.length < 3) continue;
    const id = `${direction}:${name}`;
    const group = groups.get(id) ?? { name: row.name, category: row.category, direction, days: new Map<number, number>(), ids: [] };
    const day = dayNumber(row.date);
    group.name = row.name;
    group.category = row.category;
    group.days.set(day, (group.days.get(day) ?? 0) + Math.abs(netOf(row)));
    group.ids.push(row.id);
    groups.set(id, group);
  }
  const flows: RecurringFlow[] = [];
  const events: ExpectedEvent[] = [];
  const regularIds = new Set<string>();
  for (const [id, group] of groups) {
    const days = [...group.days.keys()].sort((a, b) => a - b);
    if (days.length < 2) continue;
    const gaps = days.slice(1).map((day, i) => day - days[i]);
    const cadence = CADENCES.find(option => days.length >= option.need && gaps.every(gap => gap >= option.min && gap <= option.max));
    if (!cadence || asOfDay - days.at(-1)! > cadence.max + 3) continue;
    const amounts = [...group.days.values()];
    const amount = median(amounts);
    const tolerance = days.length === 2 ? .15 : .35;
    if (amount <= 0 || amounts.some(value => Math.abs(value - amount) / amount > tolerance)) continue;
    const next = nextDates(days, cadence.id, asOfDay);
    if (!next.days.length) continue;
    flows.push({
      id, name: group.name, category: group.category, direction: group.direction, cadence: cadence.id, amount: round(amount),
      occurrences: days.length, lastDate: dayDate(days.at(-1)!), nextDate: dayDate(next.days[0]), overdue: next.overdue,
    });
    for (const day of next.days) events.push({ flowId: id, direction: group.direction, amount: round(amount), day: day - asOfDay, date: dayDate(day) });
    for (const rowId of group.ids) regularIds.add(rowId);
  }
  flows.sort((a, b) => +a.nextDate - +b.nextDate || b.amount - a.amount);
  events.sort((a, b) => a.day - b.day);

  // ---- Everyday pool: one record per recent calendar day, quiet days included.
  const windowStart = Math.max(firstDay, asOfDay - WINDOW + 1);
  const pool: PoolDay[] = Array.from({ length: asOfDay - windowStart + 1 }, () => ({ income: 0, flexible: 0, other: 0 }));
  for (const row of rows) {
    const day = dayNumber(row.date);
    if (day < windowStart || regularIds.has(row.id) || row.category === 'own-accounts') continue;
    const record = pool[day - windowStart];
    const net = netOf(row);
    if (net > 0) record.income += net;
    else if (row.amount < 0 && FLEXIBLE_CATEGORIES.has(row.category)) { record.flexible += -row.amount; record.other += row.fee; }
    else record.other += -net;
  }
  const byWeekday: PoolDay[][] = Array.from({ length: 7 }, () => []);
  pool.forEach((record, index) => byWeekday[weekdayOf(windowStart + index)].push(record));
  const spent = (record: PoolDay) => record.flexible + record.other;
  const average = (records: PoolDay[], value: (record: PoolDay) => number) => records.length ? records.reduce((total, record) => total + value(record), 0) / records.length : 0;

  return {
    asOf: dayDate(asOfDay), asOfDay, historyDays: asOfDay - firstDay + 1, quietDays, flows, events, pool, byWeekday,
    dailyIn: average(pool, record => record.income),
    dailyOut: average(pool, spent),
    weekdayOut: byWeekday.map(records => average(records, spent)),
  };
}

export function simulateForecast(model: ForecastModel, options: ForecastOptions = {}): ForecastResult {
  const horizon = Math.min(options.horizon ?? HORIZON, HORIZON);
  const trim = options.trim ?? 0;
  const growth = options.growth ?? 0;
  const excluded = options.excluded ?? NONE;
  const start = options.start ?? 0;

  const scheduled = new Float64Array(horizon + 1);
  for (const event of model.events) {
    if (event.day > horizon || excluded.has(event.flowId)) continue;
    scheduled[event.day] += event.direction === 'in' ? event.amount : -event.amount * (1 + growth);
  }
  const columns = Array.from({ length: horizon + 1 }, () => new Float64Array(PATHS));
  // The same seed for every scenario: differences come from the change being tried, not from luck.
  const random = mulberry32(SEED);
  let dips = 0;
  for (let path = 0; path < PATHS; path++) {
    let total = start;
    let lowest = start;
    for (let day = 1; day <= horizon; day++) {
      const sameWeekday = model.byWeekday[weekdayOf(model.asOfDay + day)];
      const pool = sameWeekday.length >= 4 ? sameWeekday : model.pool;
      const pick = random();
      if (pool.length) {
        const sample = pool[Math.floor(pick * pool.length)];
        total += sample.income - (sample.flexible * (1 - trim) + sample.other) * (1 + growth);
      }
      total += scheduled[day];
      columns[day][path] = total;
      if (total < lowest) lowest = total;
    }
    if (lowest < 0) dips++;
  }
  const at = (sorted: Float64Array, share: number) => round(sorted[Math.floor(share * (PATHS - 1))]);
  const days: ForecastDay[] = columns.map((column, day) => {
    if (day === 0) return { day, date: model.asOf, low: round(start), mid: round(start), high: round(start) };
    const sorted = column.sort();
    return { day, date: dayDate(model.asOfDay + day), low: at(sorted, .1), mid: at(sorted, .5), high: at(sorted, .9) };
  });
  const known = options.start !== null && options.start !== undefined;
  return {
    days,
    lowest: days.reduce((lowest, day) => day.mid < lowest.mid ? day : lowest),
    zeroDay: known && start > 0 ? days.find(day => day.mid < 0)?.day ?? null : null,
    dipShare: known ? dips / PATHS : null,
  };
}

/**
 * What the money already in the account allows per day until the next regular income
 * (or for 30 days when none was found), after keeping regular payments aside.
 * Irregular money in is deliberately not counted.
 */
export function safeToSpend(model: ForecastModel, balance: number | null, excluded: ReadonlySet<string> = NONE): SafeToSpend | null {
  if (balance === null) return null;
  const events = model.events.filter(event => !excluded.has(event.flowId));
  const pay = events.find(event => event.direction === 'in');
  const days = pay?.day ?? 30;
  const due = events.filter(event => event.direction === 'out' && event.day <= days);
  const committed = round(due.reduce((total, event) => total + event.amount, 0));
  return {
    perDay: round(Math.max(0, (balance - committed) / days)),
    days,
    until: dayDate(model.asOfDay + days),
    committed,
    committedCount: due.length,
    payName: pay ? model.flows.find(flow => flow.id === pay.flowId)?.name ?? null : null,
    typicalDaily: round(model.dailyOut),
  };
}

/**
 * Honesty check: hide the latest 30 days, run the model on what came before,
 * and see whether what really happened lands inside the estimated range.
 */
export function backtestForecast(transactions: Transaction[], asOf: Date): ForecastBacktest | null {
  const days = 30;
  const asOfDay = dayNumber(asOf);
  const cutoff = asOfDay - days;
  const earlier = transactions.filter(row => dayNumber(row.date) <= cutoff);
  if (!earlier.length || cutoff - Math.min(...earlier.map(row => dayNumber(row.date))) < 45) return null;
  const result = simulateForecast(buildForecastModel(earlier, dayDate(cutoff)), { horizon: days }).days[days];
  const actual = round(transactions.reduce((total, row) => {
    const day = dayNumber(row.date);
    return day > cutoff && day <= asOfDay ? total + netOf(row) : total;
  }, 0));
  return { days, actual, low: result.low, mid: result.mid, high: result.high, within: actual >= result.low && actual <= result.high };
}
