import { CategoryId, Transaction } from '../../models/finance';

export type MoneyDirection = 'in' | 'out';

export interface CategoryRule {
  key: string;
  counterparty: string;
  direction: MoneyDirection;
  category: CategoryId;
}

export interface CategoryCorrections {
  overrides: Record<string, CategoryId>;
  rules: CategoryRule[];
}

export const transactionDirection = (transaction: Pick<Transaction, 'amount'>): MoneyDirection => transaction.amount > 0 ? 'in' : 'out';
export const counterpartyKey = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
export const categoryRuleKey = (name: string, direction: MoneyDirection) => JSON.stringify([direction, counterpartyKey(name)]);

export function ruleForTransaction(transaction: Transaction, rules: CategoryRule[]) {
  const key = categoryRuleKey(transaction.name, transactionDirection(transaction));
  return rules.find(rule => rule.key === key) ?? null;
}

/** Applies user choices without mutating the verified statement-derived transactions. */
export function applyCategoryCorrections(transactions: Transaction[], corrections: CategoryCorrections): Transaction[] {
  const rules = new Map(corrections.rules.map(rule => [rule.key, rule.category]));
  return transactions.map(transaction => {
    const category = corrections.overrides[transaction.id] ??
      rules.get(categoryRuleKey(transaction.name, transactionDirection(transaction))) ?? transaction.category;
    return category === transaction.category ? transaction : { ...transaction, category };
  });
}
