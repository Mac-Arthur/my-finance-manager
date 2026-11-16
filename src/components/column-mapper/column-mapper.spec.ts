import { TestBed } from '@angular/core/testing';
import { ColumnMapping } from '../../services/analysis/column-mapping';
import { ColumnMapper } from './column-mapper';

describe('Column mapper', () => {
  it('requires a safe direction mapping and emits the reviewed schema', async () => {
    await TestBed.configureTestingModule({ imports: [ColumnMapper] }).compileComponents();
    const fixture = TestBed.createComponent(ColumnMapper);
    fixture.componentRef.setInput('request', {
      source: 'csv', headerIndex: 1, headers: ['When', 'Who', 'Out', 'In'],
      preview: [['2026-11-01', 'Coffee', '10', ''], ['2026-11-02', 'Refund', '', '5']],
    });
    let emitted: ColumnMapping | undefined;
    fixture.componentInstance.mapped.subscribe(value => emitted = value);
    fixture.detectChanges();
    const selects = [...fixture.nativeElement.querySelectorAll('select')] as HTMLSelectElement[];
    for (const [index, value] of ['date', 'name', 'debit', 'credit'].entries()) {
      selects[index].value = value;
      selects[index].dispatchEvent(new Event('change'));
    }
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: HTMLButtonElement) => item.textContent?.includes('Apply mapping')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(emitted).toEqual({ source: 'csv', sheet: undefined, headerIndex: 1, fields: ['date', 'name', 'debit', 'credit'] });
  });
});
