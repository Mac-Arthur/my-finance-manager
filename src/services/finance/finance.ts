import { Statements } from '../statements/statements';
import { accountKey, ledgerTransactions } from '../analysis/ledger';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CATEGORIES, SPENDING_CATEGORIES } from '../../data/categories';
import { Budget, CategoryId, Channel, CurrencyCode, Transaction } from '../../models/finance';
import { findTransferCandidates } from './transfers';
import { applyCategoryCorrections, CategoryCorrections, categoryRuleKey, ruleForTransaction, transactionDirection } from './category-corrections';
import { CurrencyDisplay, formatMoney } from '../../shared/money';

export interface CategoryTotal {
  id: CategoryId;
  label: string;
  icon: string;
  total: number;
  count: number;
  share: number;
}

export interface DayTotal {
  date: Date;
  spent: number;
  received: number;
}

export interface Insight {
  tone: 'good' | 'warning' | 'critical' | 'info';
  title: string;
  body: string;
}

export interface SavingsGoal {
  name: string;
  target: number;
  saved: number;
}

export interface FinanceAccount {
  key: string;
  label: string;
  transactionCount: number;
  latestActivity: Date;
  availableBalance: number | null;
  currency: CurrencyCode;
}

const DAY = 86_400_000;
const BUDGETS_KEY = 'mysika.budgets.v1';
const GOAL_KEY = 'mysika.goal.v1';
const TRANSFERS_KEY = 'mysika.transfer-matches.v1';
const CORRECTIONS_KEY = 'mysika.transaction-corrections.v1';
const ALL_ACCOUNTS = '__all__';

interface TransferDecisions { confirmed: string[]; dismissed: string[]; }

const CHANNEL_LABELS: Record<Channel, string> = {
  momo: 'MoMo to MoMo',
  'other-network': 'To other networks',
  bank: 'Bank transfers',
  cash: 'Cash in / out',
  merchant: 'Merchants & POS',
  airtime: 'Airtime & data',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function sum(list: Transaction[], pick: (t: Transaction) => number = (t) => Math.abs(t.amount)) {
  return list.reduce((acc, t) => acc + pick(t), 0);
}

@Injectable({ providedIn: 'root' })
export class Finance {
  private readonly store = inject(Statements);
  private readonly currencyDisplay = inject(CurrencyDisplay);

  private readonly rawTransactions = computed(() => ledgerTransactions(this.store.confirmed()));
  readonly categoryCorrections = signal<CategoryCorrections>(readJson(CORRECTIONS_KEY, { overrides: {}, rules: [] }));
  private readonly correctedTransactions = computed(() => applyCategoryCorrections(this.rawTransactions(), this.categoryCorrections()));
  readonly transferDecisions = signal<TransferDecisions>(readJson(TRANSFERS_KEY, { confirmed: [], dismissed: [] }));
  readonly transferCandidates = computed(() => findTransferCandidates(this.correctedTransactions()));
  readonly pendingTransferCandidates = computed(() => {
    const decisions = this.transferDecisions();
    return this.transferCandidates().filter(candidate => candidate.confidence === 'review' &&
      !decisions.confirmed.includes(candidate.key) && !decisions.dismissed.includes(candidate.key));
  });
  readonly matchedTransferCandidates = computed(() => {
    const decisions = this.transferDecisions();
    return this.transferCandidates().filter(candidate => !decisions.dismissed.includes(candidate.key) &&
      (candidate.confidence === 'automatic' || decisions.confirmed.includes(candidate.key)));
  });
  /** All transactions, with matched sides classified as internal moves. */
  readonly allTransactions = computed(() => {
    const matched = new Set(this.matchedTransferCandidates().flatMap(candidate => [candidate.outgoing.id, candidate.incoming.id]));
    return this.correctedTransactions().map(transaction => matched.has(transaction.id)
      ? { ...transaction, category: 'own-accounts' as const }
      : transaction);
  });

  categorySource(transactionId: string): 'transfer' | 'transaction' | 'rule' | 'import' {
    if (this.matchedTransferCandidates().some(candidate => candidate.outgoing.id === transactionId || candidate.incoming.id === transactionId)) return 'transfer';
    if (this.categoryCorrections().overrides[transactionId]) return 'transaction';
    const transaction = this.rawTransactions().find(row => row.id === transactionId);
    return transaction && ruleForTransaction(transaction, this.categoryCorrections().rules) ? 'rule' : 'import';
  }

  categoryRuleFor(transactionId: string) {
    const transaction = this.rawTransactions().find(row => row.id === transactionId);
    return transaction ? ruleForTransaction(transaction, this.categoryCorrections().rules) : null;
  }

  similarTransactionCount(transactionId: string) {
    const selected = this.rawTransactions().find(row => row.id === transactionId);
    if (!selected) return 0;
    const key = categoryRuleKey(selected.name, transactionDirection(selected));
    return this.rawTransactions().filter(row => categoryRuleKey(row.name, transactionDirection(row)) === key).length;
  }

  setTransactionCategory(transactionId: string, category: CategoryId, teachSimilar = false) {
    const transaction = this.rawTransactions().find(row => row.id === transactionId);
    const definition = CATEGORIES[category];
    if (!transaction || !definition) return false;
    const direction = transactionDirection(transaction);
    if (definition.kind !== 'neutral' && definition.kind !== direction) return false;

    if (category !== 'own-accounts') {
      for (const candidate of this.matchedTransferCandidates().filter(candidate => candidate.outgoing.id === transactionId || candidate.incoming.id === transactionId)) {
        this.dismissTransfer(candidate.key);
      }
    }

    this.categoryCorrections.update(value => {
      const overrides = { ...value.overrides, [transactionId]: category };
      if (!teachSimilar) return { ...value, overrides };
      const key = categoryRuleKey(transaction.name, direction);
      const rule = { key, counterparty: transaction.name, direction, category };
      return { overrides, rules: [...value.rules.filter(item => item.key !== key), rule] };
    });
    if (category === 'own-accounts') this.reconsiderTransferCandidates(transactionId);
    return true;
  }

  resetTransactionCategory(transactionId: string) {
    const hadOverride = !!this.categoryCorrections().overrides[transactionId];
    this.categoryCorrections.update(value => {
      const overrides = { ...value.overrides };
      delete overrides[transactionId];
      return { ...value, overrides };
    });
    if (hadOverride) this.reconsiderTransferCandidates(transactionId);
  }

  removeCategoryRule(key: string) {
    this.categoryCorrections.update(value => ({ ...value, rules: value.rules.filter(rule => rule.key !== key) }));
  }

  private reconsiderTransferCandidates(transactionId: string) {
    const keys = new Set(this.transferCandidates()
      .filter(candidate => candidate.outgoing.id === transactionId || candidate.incoming.id === transactionId)
      .map(candidate => candidate.key));
    if (!keys.size) return;
    this.transferDecisions.update(value => ({ ...value, dismissed: value.dismissed.filter(key => !keys.has(key)) }));
  }
  /** Each imported wallet remains its own ledger. Combined totals come after transfer matching. */
  readonly accounts = computed<FinanceAccount[]>(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const transaction of this.allTransactions()) {
      const rows = grouped.get(transaction.accountKey) ?? [];
      rows.push(transaction);
      grouped.set(transaction.accountKey, rows);
    }
    return [...grouped.entries()].map(([key, rows]) => ({
      key,
      label: rows[0].account,
      transactionCount: rows.length,
      latestActivity: rows[0].date,
      availableBalance: rows.find(row => row.balance !== null)?.balance ?? null,
      currency: rows[0].currency,
    })).sort((a, b) => +b.latestActivity - +a.latestActivity || a.label.localeCompare(b.label));
  });
  readonly selectedAccountKey = signal<string | null>(null);
  readonly hasMixedCurrencies = computed(() => new Set(this.accounts().map(account => account.currency)).size > 1);
  readonly canViewAllAccounts = computed(() => this.accounts().length > 1 && !this.hasMixedCurrencies() && this.pendingTransferCandidates().length === 0);
  readonly viewingAllAccounts = computed(() => this.selectedAccountKey() === ALL_ACCOUNTS && this.canViewAllAccounts());
  readonly activeAccount = computed(() => {
    const accounts = this.accounts();
    if (this.viewingAllAccounts()) return null;
    return accounts.find(account => account.key === this.selectedAccountKey()) ?? accounts[0] ?? null;
  });
  readonly currency = computed<CurrencyCode>(() => this.activeAccount()?.currency ?? this.accounts()[0]?.currency ?? 'GHS');
  readonly allAccountsBlockedReason = computed(() => this.hasMixedCurrencies()
    ? 'Different currencies stay separate'
    : this.pendingTransferCandidates().length ? 'Review possible transfers first' : 'Combined overview');
  readonly accountSelection = computed(() => this.viewingAllAccounts() ? ALL_ACCOUNTS : this.activeAccount()?.key ?? '');
  readonly allAccountsKey = ALL_ACCOUNTS;
  selectAccount(key: string) {
    if ((key === ALL_ACCOUNTS && this.canViewAllAccounts()) || this.accounts().some(account => account.key === key)) this.selectedAccountKey.set(key);
  }
  confirmTransfer(key: string) {
    if (!this.transferCandidates().some(candidate => candidate.key === key)) return;
    this.transferDecisions.update(value => ({
      confirmed: [...new Set([...value.confirmed, key])], dismissed: value.dismissed.filter(item => item !== key),
    }));
  }
  dismissTransfer(key: string) {
    if (!this.transferCandidates().some(candidate => candidate.key === key)) return;
    this.transferDecisions.update(value => ({
      confirmed: value.confirmed.filter(item => item !== key), dismissed: [...new Set([...value.dismissed, key])],
    }));
    if (!this.canViewAllAccounts()) this.selectedAccountKey.set(null);
  }
  readonly selectedRange = signal<{ from: Date; to: Date } | null>(null);
  readonly transactions = computed(() => {
    const range = this.selectedRange();
    const activeAccount = this.activeAccount();
    return this.allTransactions()
      .filter((t) => (!activeAccount || t.accountKey === activeAccount.key) && (!range || (t.date >= range.from && t.date <= range.to)))
      .slice().sort((a, b) => +b.date - +a.date);
  });

  /** Set only after a statement has been extracted and reviewed. */
  readonly statementMeta = computed(() => {
    const activeAccount = this.activeAccount();
    const rows = this.allTransactions().filter(row => !activeAccount || row.accountKey === activeAccount.key);
    if (!rows.length) return null;
    const latest = rows[0];
    const earliest = rows[rows.length - 1];
    const balances = this.accounts().map(account => account.availableBalance);
    const combinedBalance = balances.every((balance): balance is number => balance !== null) ? balances.reduce((total, balance) => total + balance, 0) : null;
    return { provider: activeAccount?.label ?? 'All accounts', currency: this.currency(), from: new Date(earliest.date.getFullYear(), earliest.date.getMonth(), earliest.date.getDate()), to: new Date(latest.date.getFullYear(), latest.date.getMonth(), latest.date.getDate()), availableBalance: activeAccount?.availableBalance ?? combinedBalance };
  });
  readonly hasData = computed(() => this.allTransactions().length > 0 && this.statementMeta() !== null);
  get statement() {
    return this.statementMeta() ?? { provider: '', from: new Date(0), to: new Date(0), availableBalance: null };
  }

  /** Restrict averages to the part of the selected period covered by imported data. */
  readonly coverage = computed(() => {
    const range = this.selectedRange();
    const from = new Date(Math.max(+(range?.from ?? this.statement.from), +this.statement.from));
    const to = new Date(Math.min(+(range?.to ?? this.statement.to), +this.statement.to));
    return { from, to, hasData: this.hasData() && from <= to };
  });

  readonly coveredDays = computed(() => {
    const range = this.selectedRange();
    const activeAccount = this.activeAccount();
    const days = new Set<number>();
    for (const item of this.store.confirmed().filter(item => !activeAccount || accountKey(item.draft.account) === activeAccount.key)) {
      const dates = item.draft.rows.map(row => row.date.slice(0, 10)).sort();
      const from = new Date(dates[0] + 'T00:00:00');
      const to = new Date(dates[dates.length - 1] + 'T00:00:00');
      for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
        if (!range || (day >= range.from && day <= range.to)) days.add(+day);
      }
    }
    return [...days].sort((a, b) => a - b);
  });
  get periodDays() { return this.coveredDays().length; }

  // ---------- Buckets ----------
  /** Money out, excluding moves between your own wallets. */
  readonly outflows = computed(() =>
    this.transactions().filter((t) => t.amount < 0 && t.category !== 'own-accounts'),
  );
  readonly inflows = computed(() =>
    this.transactions().filter((t) => t.amount > 0 && t.category !== 'own-accounts'),
  );
  readonly ownTransfers = computed(() =>
    this.transactions().filter((t) => t.amount < 0 && t.category === 'own-accounts'),
  );

  // ---------- Headline numbers ----------
  readonly moneyIn = computed(() => sum(this.inflows()));
  readonly moneyOut = computed(() => sum(this.outflows()));
  readonly fees = computed(() => sum(this.transactions(), (t) => t.fee));
  readonly net = computed(() => this.moneyIn() - this.moneyOut() - this.fees());
  /** Everything paid to providers: per-transfer fees plus bank charge rows (e.g. "Service Charge"). Display only. */
  readonly chargeRows = computed(() => this.outflows().filter((t) => t.category === 'charges'));
  readonly allCharges = computed(() => this.fees() + sum(this.chargeRows()));
  readonly movedToOwn = computed(() => sum(this.ownTransfers()));
  readonly loansIn = computed(() => sum(this.inflows().filter((t) => t.category === 'loan')));
  readonly loanRepaid = computed(() =>
    sum(this.outflows().filter((t) => t.category === 'loan-repayment')),
  );
  /** Money in that wasn't borrowed. */
  readonly earnedIn = computed(() => this.moneyIn() - this.loansIn());
  readonly avgDailySpend = computed(() => this.periodDays ? this.moneyOut() / this.periodDays : 0);

  /** Change in spending: last half of the period vs the first half. */
  readonly spendTrend = computed(() => {
    const mid = +this.coverage().from + (this.periodDays / 2) * DAY;
    const first = sum(this.outflows().filter((t) => +t.date < mid));
    const second = sum(this.outflows().filter((t) => +t.date >= mid));
    return first === 0 ? 0 : (second - first) / first;
  });

  // ---------- Breakdowns ----------
  readonly spendingByCategory = computed<CategoryTotal[]>(() => {
    const total = this.moneyOut();
    const map = new Map<CategoryId, { total: number; count: number }>();
    for (const t of this.outflows()) {
      const e = map.get(t.category) ?? { total: 0, count: 0 };
      e.total += Math.abs(t.amount);
      e.count++;
      map.set(t.category, e);
    }
    return [...map.entries()]
      .map(([id, e]) => ({ ...CATEGORIES[id], ...e, share: total ? e.total / total : 0 }))
      .sort((a, b) => b.total - a.total);
  });

  readonly incomeByCategory = computed(() => {
    const map = new Map<CategoryId, number>();
    for (const t of this.inflows()) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    return [...map.entries()]
      .map(([id, total]) => ({ id, label: CATEGORIES[id].label, total }))
      .sort((a, b) => b.total - a.total);
  });

  readonly daily = computed<DayTotal[]>(() => {
    const days: DayTotal[] = this.coveredDays().map(date => ({ date: new Date(date), spent: 0, received: 0 }));
    const lookup = new Map(days.map((day, index) => [+day.date, index]));
    const index = (d: Date) => lookup.get(+new Date(d.getFullYear(), d.getMonth(), d.getDate())) ?? -1;
    for (const t of this.outflows()) {
      const d = days[index(t.date)];
      if (d) d.spent += Math.abs(t.amount);
    }
    for (const t of this.inflows()) {
      const d = days[index(t.date)];
      if (d) d.received += t.amount;
    }
    return days;
  });

  /** Wallet balance after every transaction, oldest first. */
  readonly balanceSeries = computed(() =>
    this.viewingAllAccounts() ? (() => {
      const balances = new Map<string, number>();
      const accountCount = this.accounts().length;
      return [...this.transactions()].reverse().flatMap(transaction => {
        if (transaction.balance !== null) balances.set(transaction.accountKey, transaction.balance);
        return balances.size === accountCount ? [{ date: transaction.date, value: [...balances.values()].reduce((a, b) => a + b, 0) }] : [];
      });
    })() : [...this.transactions()].reverse().filter((t): t is Transaction & { balance: number } => t.balance !== null).map((t) => ({ date: t.date, value: t.balance })),
  );

  readonly byChannel = computed(() => {
    const map = new Map<Channel, number>();
    for (const t of [...this.outflows(), ...this.ownTransfers()]) {
      map.set(t.channel, (map.get(t.channel) ?? 0) + Math.abs(t.amount));
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return [...map.entries()]
      .map(([id, value]) => ({ id, label: CHANNEL_LABELS[id], value, share: total ? value / total : 0 }))
      .sort((a, b) => b.value - a.value);
  });

  readonly topRecipients = computed(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of this.outflows()) {
      if (t.channel === 'airtime' || t.category === 'loan-repayment') continue;
      const e = map.get(t.name) ?? { total: 0, count: 0 };
      e.total += Math.abs(t.amount);
      e.count++;
      map.set(t.name, e);
    }
    return [...map.entries()]
      .map(([name, e]) => ({ name, ...e }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  });

  readonly timeOfDay = computed(() => {
    const buckets = [
      { label: 'Night', range: '12am – 6am', value: 0 },
      { label: 'Morning', range: '6am – 12pm', value: 0 },
      { label: 'Afternoon', range: '12pm – 6pm', value: 0 },
      { label: 'Evening', range: '6pm – 12am', value: 0 },
    ];
    for (const t of this.outflows()) buckets[Math.floor(t.date.getHours() / 6)].value += Math.abs(t.amount);
    return buckets;
  });

  readonly largestOut = computed(() =>
    this.outflows().reduce<Transaction | null>(
      (max, t) => (!max || Math.abs(t.amount) > Math.abs(max.amount) ? t : max),
      null,
    ),
  );

  // ---------- Budgets ----------
  readonly budgets = signal<Budget[]>(readJson(BUDGETS_KEY, []));

  readonly budgetProgress = computed(() => {
    const spent = new Map(this.spendingByCategory().map((c) => [c.id, c.total]));
    return this.budgets().map((b) => {
      const used = spent.get(b.category) ?? 0;
      const ratio = b.limit ? used / b.limit : 0;
      return {
        ...b,
        ...CATEGORIES[b.category],
        spent: used,
        left: b.limit - used,
        ratio,
        status: (ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok') as 'over' | 'near' | 'ok',
      };
    });
  });

  readonly unbudgetedCategories = computed(() => {
    const used = new Set(this.budgets().map((b) => b.category));
    return SPENDING_CATEGORIES.filter((c) => !used.has(c)).map((c) => CATEGORIES[c]);
  });

  setBudget(category: CategoryId, limit: number) {
    this.budgets.update((list) => {
      const exists = list.some((b) => b.category === category);
      return exists
        ? list.map((b) => (b.category === category ? { ...b, limit } : b))
        : [...list, { category, limit }];
    });
  }

  removeBudget(category: CategoryId) {
    this.budgets.update((list) => list.filter((b) => b.category !== category));
  }

  // ---------- Savings ----------
  readonly goal = signal<SavingsGoal>(
    readJson(GOAL_KEY, { name: '', target: 0, saved: 0 }),
  );

  /** Scales a period total to a 30-day month. */
  monthly(value: number) {
    return this.periodDays ? (value / this.periodDays) * 30 : 0;
  }

  /** Simple "what if" levers for the savings analyser. */
  readonly savingsLevers = computed(() => {
    const cat = (id: CategoryId) => this.spendingByCategory().find((c) => c.id === id)?.total ?? 0;
    return [
      { id: 'betting', label: 'Stop betting', perMonth: this.monthly(cat('betting')) },
      { id: 'fees', label: 'Batch transfers to halve fees', perMonth: this.monthly(this.fees()) / 2 },
      { id: 'food', label: 'Cut food & drinks by 25%', perMonth: this.monthly(cat('food')) * 0.25 },
      { id: 'transport', label: 'Cut transport by 20%', perMonth: this.monthly(cat('transport')) * 0.2 },
    ].filter((l) => l.perMonth > 0);
  });

  // ---------- Insights ----------
  /** Plain-language notes built only from the user's own transactions. Ordered by urgency. */
  readonly insights = computed<Insight[]>(() => {
    const out: Insight[] = [];
    const rows = this.transactions();
    if (!rows.length) return out;
    const currency = this.currency();
    const money = (value: number, format: 'whole' | 'full' = 'whole') => formatMoney(value, format, false, currency);
    const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const days = this.periodDays;
    const outflows = this.outflows();
    const inflows = this.inflows();
    const moneyIn = this.moneyIn();
    const moneyOut = this.moneyOut();
    const categories = this.spendingByCategory();
    const cat = (id: CategoryId) => categories.find((c) => c.id === id);

    // Cash flow: did more come in than went out?
    const net = this.net();
    if (moneyIn || moneyOut) {
      out.push(net >= 0
        ? { tone: 'good', title: `You kept ${money(net)}`, body: `${money(moneyIn)} came in and ${money(moneyOut + this.fees())} went out, including fees.` }
        : { tone: 'warning', title: `You spent ${money(-net)} more than came in`, body: `${money(moneyIn)} came in but ${money(moneyOut + this.fees())} went out, including fees.` });
    }

    // Betting.
    const betting = cat('betting');
    if (betting) {
      out.push({
        tone: 'critical',
        title: `${plural(betting.count, 'bet')} in ${plural(days, 'day')}`,
        body: `${money(betting.total)} on betting. That's about ${money(this.monthly(betting.total))} a month at this rate (estimate).`,
      });
    }

    // Loans.
    if (this.loansIn() > 0 || this.loanRepaid() > 0) {
      const loans = inflows.filter((t) => t.category === 'loan').length;
      out.push({
        tone: 'warning',
        title: loans > 1 ? `${loans} loans taken` : 'Borrowing and repayments',
        body: `${money(this.loansIn())} borrowed, ${money(this.loanRepaid())} repaid in this period.`,
      });
    }
    if (moneyOut && this.loanRepaid() / moneyOut >= 0.15) {
      out.push({ tone: 'warning', title: `${pct(this.loanRepaid() / moneyOut)} of spending went to loans`, body: 'Loan repayments are a big share of your money out. Borrowing less next time frees this up.' });
    }

    // Budgets.
    for (const budget of this.budgetProgress().filter((b) => b.status !== 'ok')) {
      out.push(budget.status === 'over'
        ? { tone: 'critical', title: `Over your ${budget.label} budget`, body: `${money(budget.spent)} spent against a ${money(budget.limit)} limit — ${money(-budget.left)} over.` }
        : { tone: 'warning', title: `${budget.label} budget nearly used`, body: `${pct(budget.ratio)} used. ${money(budget.left)} left.` });
    }

    // Spending trend (needs enough days to compare halves).
    const trend = this.spendTrend();
    if (days >= 14 && Math.abs(trend) >= 0.15) {
      out.push(trend > 0
        ? { tone: 'warning', title: `Spending up ${pct(trend)}`, body: 'You spent more in the second half of this period than in the first.' }
        : { tone: 'good', title: `Spending down ${pct(-trend)}`, body: 'You spent less in the second half of this period than in the first. Nice.' });
    }

    // Fees and charges.
    const chargeCount = rows.filter((t) => t.fee > 0).length + this.chargeRows().length;
    out.push({
      tone: moneyOut && this.allCharges() / moneyOut >= 0.03 ? 'warning' : 'info',
      title: `${money(this.allCharges(), 'full')} in fees and charges`,
      body: chargeCount
        ? `Across ${plural(chargeCount, 'transaction')}${moneyOut ? `, about ${(this.allCharges() / moneyOut * 100).toFixed(1)}% of your spending` : ''}. Fewer, bigger transfers usually cost less.`
        : 'No fees or charges in this period.',
    });

    // Where the money went.
    const top = categories[0];
    if (top) {
      out.push({ tone: 'info', title: `${top.label} is your biggest spend`, body: `${money(top.total)} across ${plural(top.count, 'payment')} — ${pct(top.share)} of your spending.` });
    }
    const second = categories[1];
    if (second && second.share >= 0.1) {
      out.push({ tone: 'info', title: `Next up: ${second.label}`, body: `${money(second.total)} — ${pct(second.share)} of your spending.` });
    }

    // Daily pace.
    if (days && moneyOut) {
      out.push({ tone: 'info', title: `About ${money(this.avgDailySpend())} a day`, body: `Your average spending over ${plural(days, 'day')}. That's roughly ${money(this.monthly(moneyOut))} a month.` });
    }

    // Busiest spending day.
    const busiest = this.daily().reduce<DayTotal | null>((max, d) => (!max || d.spent > max.spent ? d : max), null);
    if (busiest && busiest.spent > 0 && days > 1) {
      out.push({ tone: 'info', title: `Biggest spending day: ${day(busiest.date)}`, body: `${money(busiest.spent)} went out that day.` });
    }

    // No-spend days.
    const quiet = this.daily().filter((d) => d.spent === 0).length;
    if (days >= 7 && quiet > 0) {
      out.push({ tone: 'good', title: `${plural(quiet, 'no-spend day')}`, body: `Out of ${plural(days, 'day')}, ${quiet} had no spending at all.` });
    }

    // Largest single payment.
    const largest = this.largestOut();
    if (largest) {
      out.push({ tone: 'info', title: `Largest payment: ${money(Math.abs(largest.amount))}`, body: `To ${largest.name} on ${day(largest.date)}.` });
    }

    // Who gets the most.
    const recipient = this.topRecipients()[0];
    if (recipient && recipient.count > 1) {
      out.push({ tone: 'info', title: `Most paid: ${recipient.name}`, body: `${money(recipient.total)} across ${plural(recipient.count, 'payment')}.` });
    }

    // Small payments add up.
    if (outflows.length >= 10) {
      const sorted = outflows.map((t) => Math.abs(t.amount)).sort((a, b) => a - b);
      const cutoff = sorted[Math.floor(sorted.length / 2)];
      const small = sorted.filter((v) => v <= cutoff);
      out.push({ tone: 'info', title: `${small.length} small payments add up`, body: `Payments of ${money(cutoff, 'full')} or less came to ${money(small.reduce((a, b) => a + b, 0))} in total.` });
    }

    // Airtime and cash out.
    const airtime = cat('airtime');
    if (airtime) {
      out.push({ tone: 'info', title: `${money(airtime.total)} on airtime and data`, body: `${plural(airtime.count, 'top-up')}, about ${money(this.monthly(airtime.total))} a month. A bundle can be cheaper than many small top-ups.` });
    }
    const cash = cat('cash-out');
    if (cash) {
      out.push({ tone: 'info', title: `${money(cash.total)} taken out as cash`, body: `${plural(cash.count, 'withdrawal')}. Cash is harder to track, so keep an eye on where it goes.` });
    }

    // Time of day.
    const times = this.timeOfDay();
    const peak = times.reduce((max, t) => (t.value > max.value ? t : max), times[0]);
    if (peak.value > 0 && moneyOut) {
      out.push({ tone: 'info', title: `You spend most in the ${peak.label.toLowerCase()}`, body: `${pct(peak.value / moneyOut)} of your spending happens ${peak.range}.` });
    }

    // Weekend vs weekday.
    const weekend = sum(outflows.filter((t) => t.date.getDay() === 0 || t.date.getDay() === 6));
    if (moneyOut && days >= 7 && weekend / moneyOut >= 0.4) {
      out.push({ tone: 'info', title: 'Weekends cost you more', body: `${pct(weekend / moneyOut)} of your spending happens on Saturdays and Sundays.` });
    }

    // Money in.
    const income = this.incomeByCategory();
    if (inflows.length) {
      const senders = new Map<string, number>();
      for (const t of inflows.filter((t) => t.category !== 'loan')) senders.set(t.name, (senders.get(t.name) ?? 0) + t.amount);
      const [name, total] = [...senders.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      out.push(name && total
        ? { tone: 'info', title: `Top source of money: ${name}`, body: `${money(total)} — ${pct(total / moneyIn)} of everything that came in (${plural(inflows.length, 'payment')}).` }
        : { tone: 'info', title: `${money(moneyIn)} came in`, body: `${plural(inflows.length, 'payment')}, mostly ${income[0]?.label.toLowerCase() ?? 'received'}.` });
    } else {
      out.push({ tone: 'info', title: 'No money came in', body: 'This period has no incoming payments.' });
    }

    // Balance low point.
    const balances = this.balanceSeries();
    if (balances.length > 1) {
      const low = balances.reduce((min, b) => (b.value < min.value ? b : min), balances[0]);
      out.push({ tone: low.value <= 0 ? 'warning' : 'info', title: `Lowest balance: ${money(low.value, 'full')}`, body: `On ${day(low.date)}. ${low.value <= 0 ? 'A small buffer helps avoid running empty.' : 'Your balance stayed above zero.'}` });
    }

    // Own transfers.
    if (this.ownTransfers().length) {
      out.push({
        tone: 'info',
        title: `${plural(this.ownTransfers().length, 'own-account transfer')}`,
        body: `${money(this.movedToOwn())} moved between accounts you marked as your own.`,
      });
    }

    // Activity summary (always available).
    out.push({ tone: 'info', title: `${plural(rows.length, 'transaction')} in ${plural(Math.max(days, 1), 'day')}`, body: `${outflows.length} out, ${inflows.length} in — about ${(rows.length / Math.max(days, 1)).toFixed(1)} a day.` });

    const rank = { critical: 0, warning: 1, good: 2, info: 3 } as const;
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
  });

  constructor() {
    effect(() => this.currencyDisplay.current.set(this.currency()));
    effect(() => { const value = JSON.stringify(this.budgets()); try { localStorage.setItem(BUDGETS_KEY, value); } catch { /* No persisted budgets when storage is unavailable. */ } });
    effect(() => { const value = JSON.stringify(this.goal()); try { localStorage.setItem(GOAL_KEY, value); } catch { /* No persisted goal when storage is unavailable. */ } });
    effect(() => { const value = JSON.stringify(this.transferDecisions()); try { localStorage.setItem(TRANSFERS_KEY, value); } catch { /* Decisions remain available for this session. */ } });
    effect(() => { const value = JSON.stringify(this.categoryCorrections()); try { localStorage.setItem(CORRECTIONS_KEY, value); } catch { /* Corrections remain available for this session. */ } });
  }
}
