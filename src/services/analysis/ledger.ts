import { AnalysisDraft, AnalysisRow } from '../../models/analysis';
import { Transaction } from '../../models/finance';

export interface ConfirmedImport { id: string; draft: AnalysisDraft; }
export const accountKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const rowIdentity = (account: string, id: string) => JSON.stringify([accountKey(account), id]);
const signature = (row: AnalysisRow) => JSON.stringify([row.date, row.amountMinor, row.feeMinor, row.balanceMinor]);

/** Overlapping imports without stable provider IDs are blocked, never silently deduplicated. */
export function assertCompatible(draft: AnalysisDraft, imports: ConfirmedImport[]) {
  if (imports.some(item => accountKey(item.draft.account) !== accountKey(draft.account))) throw new Error('This prototype supports one wallet at a time. Use the same account label as your earlier imports, or remove them before switching wallets.');
  const dates = draft.rows.map(row => row.date.slice(0, 10)).sort();
  for (const previous of imports.filter(item => accountKey(item.draft.account) === accountKey(draft.account))) {
    const oldDates = previous.draft.rows.map(row => row.date.slice(0, 10)).sort();
    if (dates[0] <= oldDates.at(-1)! && dates.at(-1)! >= oldDates[0]) {
      if ([...draft.rows, ...previous.draft.rows].some(row => !row.providerId)) throw new Error('This account already has transactions in these dates. Overlapping files require transaction IDs to avoid double-counting. Use non-overlapping files or a CSV with transaction IDs.');
    }
    const previousIds = new Map(previous.draft.rows.filter(row => row.providerId).map(row => [row.providerId, row]));
    for (const row of draft.rows) {
      const old = previousIds.get(row.providerId);
      if (old && signature(old) !== signature(row)) throw new Error(`Transaction ID ${row.providerId} conflicts with an earlier import. Check the source files before continuing.`);
    }
  }
}

export function ledgerTransactions(imports: ConfirmedImport[]): Transaction[] {
  const entries = new Map<string, Transaction>();
  // Consistent precedence keeps user classification stable when an overlapping file is added.
  const order = new Map<string, number>();
  for (const item of imports) {
    // Oldest-first files (most banks) put the latest row last; MoMo puts it first. Use that order to break same-time ties.
    const rows = item.draft.rows;
    const ascending = rows.length > 1 && rows[0].date <= rows[rows.length - 1].date;
    for (const row of rows) {
      const id = row.providerId ? rowIdentity(item.draft.account, row.providerId) : `${item.id}:${row.sourceRow}`;
      if (entries.has(id)) continue;
      order.set(id, ascending ? row.sourceRow : -row.sourceRow);
      entries.set(id, {
        id, date: new Date(row.date), type: 'Imported', name: row.name,
        amount: row.amountMinor / 100, fee: row.feeMinor / 100, balance: row.balanceMinor === null ? null : row.balanceMinor / 100,
        reference: row.reference, category: row.category,
        channel: row.category === 'airtime' ? 'airtime' : row.category === 'cash-out' ? 'cash' : 'momo',
      });
    }
  }
  return [...entries.values()].sort((a, b) => +b.date - +a.date || order.get(b.id)! - order.get(a.id)!);
}
