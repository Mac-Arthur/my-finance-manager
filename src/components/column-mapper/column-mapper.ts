import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { ColumnMapping, ColumnMappingRequest, MappingField } from '../../services/analysis/column-mapping';
import { fieldFor, validHeaders } from '../../services/analysis/statement-fields';

const OPTIONS: { value: MappingField; label: string }[] = [
  { value: 'ignore', label: 'Ignore' }, { value: 'date', label: 'Date' }, { value: 'time', label: 'Time' },
  { value: 'name', label: 'Description' }, { value: 'amount', label: 'Signed amount' }, { value: 'debit', label: 'Debit / money out' },
  { value: 'credit', label: 'Credit / money in' }, { value: 'fee', label: 'Fee' }, { value: 'tax', label: 'Tax / levy' },
  { value: 'balance', label: 'Running balance' }, { value: 'id', label: 'Transaction ID' }, { value: 'reference', label: 'Reference' },
  { value: 'currency', label: 'Currency' }, { value: 'type', label: 'Transaction type' },
];

@Component({ selector: 'app-column-mapper', templateUrl: './column-mapper.html', styleUrl: './column-mapper.css' })
export class ColumnMapper {
  readonly request = input.required<ColumnMappingRequest>();
  readonly busy = input(false);
  readonly mapped = output<ColumnMapping>();
  readonly close = output<void>();
  protected readonly options = OPTIONS;
  protected readonly fields = linkedSignal(() => this.request().headers.map(header => fieldFor(header) ?? 'ignore' as MappingField));
  protected readonly error = computed(() => {
    const fields = this.fields();
    if (!fields.length) return '';
    const used = fields.filter(field => field !== 'ignore');
    if (new Set(used).size !== used.length) return 'Use each column meaning only once.';
    if (!validHeaders(fields.map(field => field === 'ignore' ? undefined : field))) return 'Choose Date, Description, and either Signed amount or both Debit and Credit.';
    return '';
  });

  protected change(index: number, value: string) {
    this.fields.update(fields => fields.map((field, at) => at === index ? value as MappingField : field));
  }

  protected submit() {
    if (this.busy() || this.error()) return;
    const request = this.request();
    this.mapped.emit({ source: request.source, sheet: request.sheet, headerIndex: request.headerIndex, fields: [...this.fields()] });
  }
}
