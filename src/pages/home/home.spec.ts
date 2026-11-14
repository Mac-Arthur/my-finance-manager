import { Statements } from '../../services/statements/statements';
import { parseCsv } from '../../services/analysis/parse-statement';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Home } from './home';

describe('Home first visit', () => {
  let fixture: ComponentFixture<Home>;
  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await TestBed.configureTestingModule({ imports: [Home], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
  });
  afterEach(() => vi.unstubAllGlobals());
  it('offers statements without showing fabricated financial data', () => {
    expect(fixture.nativeElement.textContent).toContain('A fresh start for your finances');
    expect(fixture.nativeElement.querySelector('a[href="/statements"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.transaction-row').length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('MacArthur');
    expect(fixture.nativeElement.textContent).not.toContain('Available balance');
  });
  it('renders confirmed imports and anchors the initial view to their latest month', async () => {
    const draft = parseCsv('date,name,amount,fee,balance\n2025-02-01,Coffee,-10,0.50,89.50');
    draft.account = 'My wallet';
    TestBed.inject(Statements).items.set([{ id: 'test', name: 'test.csv', kind: 'csv', size: 1, addedAt: '2025-02-02', status: 'confirmed', draft, file: new Blob() }]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.transaction-row').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Feb 2025');
    expect(fixture.nativeElement.textContent).toContain('Coffee');
    expect(fixture.nativeElement.textContent).not.toContain('A fresh start for your finances');
  });
});
