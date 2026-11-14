import { TestBed } from '@angular/core/testing';
import { StatementReview } from './statement-review';
import { parseCsv } from '../../services/analysis/parse-statement';
import { AnalysisDraft } from '../../models/analysis';

describe('Statement review', () => {
  it('requires an account label and emits the reviewed copy only after confirmation', async () => {
    await TestBed.configureTestingModule({ imports: [StatementReview] }).compileComponents();
    const fixture = TestBed.createComponent(StatementReview);
    const original = parseCsv('date,name,amount\n2026-11-01,Coffee,-10');
    fixture.componentRef.setInput('draft', original);
    await fixture.whenStable();
    const submit = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Confirm &')) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const account = fixture.nativeElement.querySelector('input[placeholder="e.g. My MTN wallet"]') as HTMLInputElement;
    account.value = 'My wallet'; account.dispatchEvent(new Event('input'));
    const amount = fixture.nativeElement.querySelector('input[aria-label="Amount for source row 2"]') as HTMLInputElement;
    amount.value = '-12.50'; amount.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    let emitted: AnalysisDraft | undefined;
    fixture.componentInstance.confirm.subscribe(value => emitted = value);
    submit.click();
    expect(emitted?.rows[0].amountMinor).toBe(-1250);
    expect(original.rows[0].amountMinor).toBe(-1000);
    expect(original.account).toBe('');
  });
});
