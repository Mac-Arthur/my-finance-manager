import { CategoryId, Transaction } from '../../models/finance';
import { findTransferCandidates } from './transfers';

function transaction(id: string, account: string, amount: number, date: string, category: CategoryId): Transaction {
  return { id, accountKey: account.toLowerCase(), account, amount, date: new Date(date), category,
    type: 'Imported', name: 'Transfer', fee: 0, balance: null, reference: '', channel: 'momo' };
}

describe('Cross-account transfer matching', () => {
  it('automatically matches a unique pair already identified as an own-account move', () => {
    const rows = [
      transaction('out', 'Bank', -100, '2026-11-01T10:00:00', 'own-accounts'),
      transaction('in', 'MoMo', 100, '2026-11-01T10:01:00', 'from-bank'),
    ];
    expect(findTransferCandidates(rows)).toMatchObject([{ confidence: 'automatic', outgoing: { id: 'out' }, incoming: { id: 'in' } }]);
  });

  it('asks for review when the exact pair lacks strong own-account evidence', () => {
    const rows = [
      transaction('out', 'Bank', -100, '2026-11-01T10:00:00', 'transfers'),
      transaction('in', 'MoMo', 100, '2026-11-01T10:01:00', 'received'),
    ];
    expect(findTransferCandidates(rows)[0].confidence).toBe('review');
  });

  it('does not guess when two counterparts are equally close or outside three days', () => {
    const rows = [
      transaction('out', 'Bank', -100, '2026-11-02T10:00:00', 'transfers'),
      transaction('before', 'MoMo', 100, '2026-11-02T09:00:00', 'received'),
      transaction('after', 'Wallet', 100, '2026-11-02T11:00:00', 'received'),
      transaction('late-out', 'Bank', -50, '2026-11-01T10:00:00', 'own-accounts'),
      transaction('late-in', 'MoMo', 50, '2026-11-05T10:00:01', 'from-bank'),
    ];
    expect(findTransferCandidates(rows)).toEqual([]);
  });
});
