import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Transactions } from './transactions';
import { Statements } from '../../services/statements/statements';
import { parseCsv } from '../../services/analysis/parse-statement';

describe('Transactions browsing', () => {
  let fixture: ComponentFixture<Transactions>;
  const root = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => [...root().querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
  const search = async (value: string) => {
    const input = root().querySelector('input[type="search"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    await TestBed.configureTestingModule({ imports: [Transactions], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(Transactions);
    const draft = parseCsv('date,name,amount,fee,balance\n2025-02-01,Coffee,-10,0,90\n2025-02-02,Salary,100,0,190\n2025-02-03,Coffee,-20,0,170');
    draft.account = 'My wallet';
    TestBed.inject(Statements).items.set([{ id: 'test', name: 'test.csv', kind: 'csv', size: 1, addedAt: '2025-02-04', status: 'confirmed', draft, file: new Blob() }]);
    await fixture.whenStable();
  });
  afterEach(() => { Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.unstubAllGlobals(); });

  it('previews the same result count as applied filters while searching', async () => {
    await search('Coffee');
    button('Filters').click();
    await fixture.whenStable();
    expect(root().querySelector('dialog')?.open).toBe(true);
    expect(button('Show 2 transactions')).toBeTruthy();
    const directions = root().querySelectorAll('dialog .seg button');
    (directions[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    button('Show 0 transactions').click();
    await fixture.whenStable();
    expect(root().textContent).toContain('No transactions found');
    button('Clear search and filters').click();
    await fixture.whenStable();
    expect(root().querySelectorAll('.transaction-row')).toHaveLength(3);
  });

  it('sorts chronologically and updates summaries for quick filters', async () => {
    expect(root().querySelector('.day-heading')?.textContent).toContain('3 Feb 2025');
    const select = root().querySelector('select')!;
    select.value = 'oldest';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(root().querySelector('.day-heading')?.textContent).toContain('1 Feb 2025');
    button('Money in').click();
    await fixture.whenStable();
    expect(root().querySelectorAll('.transaction-row')).toHaveLength(1);
    expect(root().querySelector('.flow-stat--net')?.textContent).toContain('100.00');
    expect(root().querySelectorAll('.flow-stat')[1].textContent).toContain('0.00');
  });

  it('opens details and restores focus after closing', async () => {
    const row = root().querySelector('.transaction-row') as HTMLButtonElement;
    row.focus();
    row.click();
    await fixture.whenStable();
    expect(root().querySelector('dialog')?.open).toBe(true);
    button('Cancel').click();
    await fixture.whenStable();
    expect(root().querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('resets pagination when searching and preserves full-day totals', async () => {
    const draft = parseCsv('date,name,amount,fee,balance\n' + Array.from({ length: 60 }, (_, i) => `2025-02-01,Payment ${i},-1,0,${100-i}`).join('\n'));
    draft.account = 'My wallet';
    TestBed.inject(Statements).items.update(items => [{ ...items[0], draft }]);
    await fixture.whenStable();
    expect(root().querySelectorAll('.transaction-row')).toHaveLength(50);
    expect(root().querySelector('.day-heading')?.textContent).toContain('60.00');
    button('Show 10 more').click();
    await fixture.whenStable();
    expect(root().querySelectorAll('.transaction-row')).toHaveLength(60);
    await search('Payment');
    expect(root().querySelectorAll('.transaction-row')).toHaveLength(50);
  });
});
