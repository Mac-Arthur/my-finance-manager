import { CategoryId, CurrencyCode } from './finance';
import type { ColumnMapping } from '../services/analysis/column-mapping';

export interface AnalysisRow {
  sourceRow: number;
  providerId: string;
  date: string;
  name: string;
  amountMinor: number;
  feeMinor: number;
  balanceMinor: number | null;
  category: CategoryId;
  reference: string;
}
export interface AnalysisDraft {
  version: 1;
  mode: 'local';
  account: string;
  currency: CurrencyCode;
  rows: AnalysisRow[];
  warnings: string[];
  extractedText: string;
  /** Consecutive rows whose running balance was checked, and how many did not add up. */
  balanceCheck?: { checked: number; breaks: number };
}
/** `password` unlocks protected PDFs. It lives only in memory for one read and is never stored. */
export interface AnalysisInput { kind: 'pdf' | 'csv' | 'xlsx'; file: Blob; password?: string; mapping?: ColumnMapping; }
export interface AnalysisEngine {
  analyse(input: AnalysisInput, progress: (message: string) => void): Promise<AnalysisDraft>;
}
