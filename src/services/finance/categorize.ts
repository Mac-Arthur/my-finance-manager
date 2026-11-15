import { Channel, CategoryId, Transaction } from '../../models/finance';
import { RawRow } from '../../models/finance';

const RULES: [RegExp, CategoryId][] = [
  [/\b(ride|okada|motor|fuel|trotro|uber|bolt|taxi|transport)\b/i, 'transport'],
  [/\b(food|drinks?|coffee|chop|lunch|breakfast|supper|fast food)\b/i, 'food'],
  [/\b(water|electric|ecg|light bill|internet|rent|dstv|gotv)\b/i, 'bills'],
  [/\b(offering|tithe|flowers|gift|donation|church)\b/i, 'giving'],
  [/\b(haircut|salon|barber|hair)\b/i, 'personal-care'],
];

/**
 * Turns a raw statement row into a categorized transaction.
 * Rules run top to bottom; the first match wins. Unmatched debits are "Sent to people".
 */
export function toTransaction(row: RawRow, index: number): Transaction {
  const [iso, type, rawName, amount, fee, balance, reference] = row;
  let name = rawName;
  let category: CategoryId;
  let channel: Channel =
    type === 'OTHER NETWORKS' ? 'other-network' : type === 'CASH OUT' || type === 'CASH IN' ? 'cash' : 'momo';

  if (rawName.startsWith('ME:')) {
    name = 'My Telecel wallet';
    category = 'own-accounts';
  } else if (rawName.startsWith('BANK:')) {
    name = rawName.slice(5);
    category = 'from-bank';
    channel = 'bank';
  } else if (rawName.startsWith('LOAN:')) {
    name = rawName.slice(5);
    category = amount > 0 ? 'loan' : 'loan-repayment';
  } else if (amount > 0) {
    category = 'received';
  } else if (type === 'AIRTIME' || /bundle/i.test(rawName)) {
    category = 'airtime';
    channel = 'airtime';
  } else if (type === 'CASH OUT') {
    category = 'cash-out';
  } else if (/sportybet|betway|bet9ja|1xbet/i.test(rawName)) {
    category = 'betting';
    channel = 'merchant';
  } else if (type === 'DEBIT') {
    category = 'shopping';
    channel = 'merchant';
  } else {
    const haystack = `${reference} ${rawName}`;
    category = RULES.find(([re]) => re.test(haystack))?.[1] ?? 'transfers';
  }

  return {
    id: `${iso}-${index}`,
    accountKey: 'my wallet',
    account: 'My wallet',
    currency: 'GHS',
    date: new Date(iso),
    type,
    name,
    amount,
    fee,
    balance,
    reference,
    channel,
    category,
  };
}
