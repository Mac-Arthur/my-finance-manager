import type { Field } from './statement-fields';

export type MappingField = Field | 'ignore';
export interface ColumnMappingRequest {
  source: 'csv' | 'xlsx';
  sheet?: string;
  headerIndex: number;
  headers: string[];
  preview: string[][];
}
export interface ColumnMapping {
  source: 'csv' | 'xlsx';
  sheet?: string;
  headerIndex: number;
  fields: MappingField[];
}

export class MappingRequiredError extends Error {
  override readonly name = 'MappingRequiredError';
  constructor(readonly request: ColumnMappingRequest) {
    super('Choose what each column means so this statement can be read safely.');
  }
}
