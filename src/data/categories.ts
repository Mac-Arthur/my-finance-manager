import { Category, CategoryId } from '../models/finance';

export const CATEGORIES: Record<CategoryId, Category> = {
  transport: { id: 'transport', label: 'Transport', kind: 'out', icon: 'M5 17h14M6 17V9l2-4h8l2 4v8M6 13h12M8 17v2M16 17v2' },
  food: { id: 'food', label: 'Food & drinks', kind: 'out', icon: 'M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 0-3 3-3 6s1 4 3 4v8' },
  betting: { id: 'betting', label: 'Betting', kind: 'out', icon: 'M4 4h16v16H4zM9 9h.01M15 15h.01M15 9h.01M9 15h.01' },
  airtime: { id: 'airtime', label: 'Airtime & data', kind: 'out', icon: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2' },
  bills: { id: 'bills', label: 'Bills & utilities', kind: 'out', icon: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' },
  shopping: { id: 'shopping', label: 'Shopping', kind: 'out', icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0' },
  'cash-out': { id: 'cash-out', label: 'Cash out', kind: 'out', icon: 'M3 7h18v10H3zM12 12h.01M7 12h.01M17 12h.01' },
  giving: { id: 'giving', label: 'Gifts & giving', kind: 'out', icon: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0' },
  'personal-care': { id: 'personal-care', label: 'Personal care', kind: 'out', icon: 'M6 6a3 3 0 1 0 0 .01M6 18a3 3 0 1 0 0 .01M8.5 8 20 18M8.5 16 20 6' },
  'loan-repayment': { id: 'loan-repayment', label: 'Loan repayment', kind: 'out', icon: 'M3 10h18L12 4zM5 10v8M19 10v8M9 10v8M15 10v8M3 20h18' },
  charges: { id: 'charges', label: 'Bank & MoMo charges', kind: 'out', icon: 'M4 4h16v16H4zM9 15l6-6M9.5 9.5h.01M14.5 14.5h.01' },
  transfers: { id: 'transfers', label: 'Sent to people', kind: 'out', icon: 'M22 2 11 13M22 2l-7 20-4-9-9-4z' },
  'from-bank': { id: 'from-bank', label: 'From my bank', kind: 'in', icon: 'M3 10h18L12 4zM5 10v8M19 10v8M9 10v8M15 10v8M3 20h18' },
  received: { id: 'received', label: 'Received', kind: 'in', icon: 'M12 5v14M5 12l7 7 7-7' },
  loan: { id: 'loan', label: 'Loan received', kind: 'in', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  'own-accounts': { id: 'own-accounts', label: 'Between my wallets', kind: 'neutral', icon: 'M7 7h13l-3-3M17 17H4l3 3' },
};

/** Spending categories, in the order budgets are shown. */
export const SPENDING_CATEGORIES: CategoryId[] = [
  'transport',
  'food',
  'betting',
  'airtime',
  'bills',
  'shopping',
  'cash-out',
  'giving',
  'personal-care',
  'loan-repayment',
  'charges',
  'transfers',
];
