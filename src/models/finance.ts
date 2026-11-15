/** Where the money moved through. */
export type Channel = 'momo' | 'other-network' | 'bank' | 'cash' | 'merchant' | 'airtime';
export type CurrencyCode = 'GHS' | 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD' | 'NGN' | 'KES' | 'ZAR';

export type CategoryId =
  // Money out
  | 'transport'
  | 'food'
  | 'betting'
  | 'airtime'
  | 'bills'
  | 'shopping'
  | 'cash-out'
  | 'giving'
  | 'personal-care'
  | 'loan-repayment'
  | 'charges'
  | 'transfers'
  // Money in
  | 'from-bank'
  | 'received'
  | 'loan'
  // Neither: moving money between your own wallets
  | 'own-accounts';

export interface Category {
  id: CategoryId;
  label: string;
  /** 24x24 stroke icon path. */
  icon: string;
  kind: 'out' | 'in' | 'neutral';
}

export interface Transaction {
  id: string;
  /** Normalized source account key. Keeps balances and corrections scoped to one wallet. */
  accountKey: string;
  /** Friendly label detected from the statement, e.g. "MTN MoMo ••1234". */
  account: string;
  currency: CurrencyCode;
  date: Date;
  /** Raw MoMo payment type, e.g. "MOMO USER", "OTHER NETWORKS". */
  type: string;
  /** Cleaned-up name to show in the UI. */
  name: string;
  /** Signed: negative = money out. */
  amount: number;
  fee: number;
  /** Wallet balance after this transaction. */
  balance: number | null;
  reference: string;
  channel: Channel;
  category: CategoryId;
}

export interface StatementMeta {
  provider: string;
  currency: CurrencyCode;
  from: Date;
  to: Date;
  availableBalance: number;
  openingBalance: number;
}

export interface Budget {
  category: CategoryId;
  limit: number;
}

/** Normalized input row for categorization; populated by a future import adapter. */
export type RawRow = [string, string, string, number, number, number, string];
