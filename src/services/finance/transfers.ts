import { Transaction } from '../../models/finance';

export interface TransferCandidate {
  key: string;
  outgoing: Transaction;
  incoming: Transaction;
  confidence: 'automatic' | 'review';
  gapMs: number;
}

const WINDOW_MS = 3 * 86_400_000;
const minor = (value: number) => Math.round(Math.abs(value) * 100);
export const transferKey = (outgoingId: string, incomingId: string) => JSON.stringify([outgoingId, incomingId]);

function possible(outgoing: Transaction, incoming: Transaction) {
  return outgoing.accountKey !== incoming.accountKey && outgoing.currency === incoming.currency && minor(outgoing.amount) === minor(incoming.amount) &&
    Math.abs(+outgoing.date - +incoming.date) <= WINDOW_MS;
}

function nearest<T extends Transaction>(source: Transaction, options: T[]) {
  const sorted = options.slice().sort((a, b) => Math.abs(+source.date - +a.date) - Math.abs(+source.date - +b.date));
  if (!sorted.length) return null;
  const firstGap = Math.abs(+source.date - +sorted[0].date);
  if (sorted[1] && Math.abs(+source.date - +sorted[1].date) === firstGap) return null;
  return sorted[0];
}

/**
 * Finds exact-value, nearby, cross-account pairs. A pair is only returned when both rows choose
 * each other as their nearest counterpart, so one transaction can never be silently reused.
 */
export function findTransferCandidates(transactions: Transaction[]): TransferCandidate[] {
  const outgoing = transactions.filter(row => row.amount < 0);
  const incoming = transactions.filter(row => row.amount > 0);
  const candidates: TransferCandidate[] = [];

  for (const out of outgoing) {
    const inOptions = incoming.filter(row => possible(out, row));
    const match = nearest(out, inOptions);
    if (!match) continue;
    const outOptions = outgoing.filter(row => possible(row, match));
    if (nearest(match, outOptions)?.id !== out.id) continue;

    const strongCategory = out.category === 'own-accounts' &&
      (match.category === 'from-bank' || match.category === 'own-accounts');
    candidates.push({
      key: transferKey(out.id, match.id),
      outgoing: out,
      incoming: match,
      confidence: strongCategory && inOptions.length === 1 && outOptions.length === 1 ? 'automatic' : 'review',
      gapMs: Math.abs(+out.date - +match.date),
    });
  }

  return candidates.sort((a, b) => +b.outgoing.date - +a.outgoing.date);
}
