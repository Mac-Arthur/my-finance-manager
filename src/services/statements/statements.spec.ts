import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';
import { Statements } from './statements';

function file(name: string, contents: string) {
  const bytes = new TextEncoder().encode(contents);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
}

describe('Local statement inbox', () => {
  let service: Statements;
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, bytes: ArrayBuffer) => bytes } });
    TestBed.configureTestingModule({});
    service = TestBed.inject(Statements);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists a PDF across service instances without claiming analysis', async () => {
    expect(await service.save(file('statement.pdf', '%PDF-1.7\nTest fixture'))).toBe(true);
    const restored = TestBed.runInInjectionContext(() => new Statements());
    await restored.load();
    expect(restored.items()).toHaveLength(1);
    expect(restored.items()[0].status).toBe('awaiting-analysis');
    expect(restored.items()[0].name).toBe('statement.pdf');
    expect(service.busy()).toBe(false);
  });

  it('detects duplicate contents even when the filename changes', async () => {
    await service.save(file('first.csv', 'date,amount\n2026-11-01,10'));
    expect(await service.save(file('renamed.csv', 'date,amount\n2026-11-01,10'))).toBe(false);
    expect(service.error()).toContain('already saved');
    expect(service.items()).toHaveLength(1);
  });

  it('explains that statement imports need a secure browser connection', async () => {
    vi.stubGlobal('crypto', {});
    expect(await service.save(file('statement.pdf', '%PDF-1.7\nTest fixture'))).toBe(false);
    expect(service.error()).toContain('Open myAvailable with HTTPS');
    expect(service.busy()).toBe(false);
    expect(service.items()).toEqual([]);
  });

  it('rejects invalid, empty, unsupported and oversized files', async () => {
    for (const input of [file('bad.pdf', 'not a pdf'), file('bad.csv', 'no columns'), file('empty.csv', ''), file('bad.exe', 'x'), { name: 'large.pdf', size: 11 * 1024 * 1024 } as File]) {
      expect(await service.save(input)).toBe(false);
      expect(service.error()).toBeTruthy();
      expect(service.busy()).toBe(false);
    }
    expect(service.items()).toHaveLength(0);
  });

  it('removes a saved statement from persistent storage', async () => {
    await service.save(file('statement.csv', 'date,amount\n2026-11-01,10'));
    await service.remove(service.items()[0].id);
    const restored = TestBed.runInInjectionContext(() => new Statements());
    await restored.load();
    expect(restored.items()).toEqual([]);
  });

  it('reports a storage failure without inventing a saved statement', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('Storage unavailable'); } });
    expect(await service.save(file('statement.csv', 'date,amount\n2026-11-01,10'))).toBe(false);
    expect(service.items()).toEqual([]);
    expect(service.busy()).toBe(false);
    expect(service.error()).toContain('Storage unavailable');
  });
});

describe('Analysis to dashboard workflow', () => {
  const csv = 'date,name,amount,fee,balance,id\n2026-10-31T12:00,Salary,1000,0,1000,A1\n2026-11-01T12:00,Coffee,-20,0.50,979.50,A2';
  beforeEach(async () => {
    const { STATEMENT_ANALYSER } = await import('../analysis/statement-analyser');
    const { parseCsv } = await import('../analysis/parse-statement');
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, bytes: ArrayBuffer) => bytes } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    TestBed.configureTestingModule({ providers: [{ provide: STATEMENT_ANALYSER, useValue: { analyse: async () => parseCsv(csv) } }] });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps drafts out of totals, then persists confirmation and removal', async () => {
    const { Finance } = await import('../finance/finance');
    const store = TestBed.inject(Statements);
    const finance = TestBed.inject(Finance);
    await store.save(file('statement.csv', csv));
    const id = store.items()[0].id;
    expect(await store.analyse(id)).toBe(true);
    expect(store.items()[0].status).toBe('ready');
    expect(finance.hasData()).toBe(false);
    const draft = structuredClone(store.items()[0].draft!);
    draft.account = 'My wallet';
    expect(await store.confirm(id, draft)).toBe(true);
    expect(finance.moneyIn()).toBe(1000);
    expect(finance.moneyOut()).toBe(20);
    expect(finance.fees()).toBe(0.5);
    expect(finance.statement.availableBalance).toBe(979.5);
    store.items.set([]);
    expect(finance.hasData()).toBe(false);
    await store.load();
    expect(finance.net()).toBe(979.5);
    await store.remove(id);
    expect(finance.hasData()).toBe(false);
  });
  it('blocks an invalid edited draft without changing stored status', async () => {
    const store = TestBed.inject(Statements);
    await store.save(file('statement.csv', csv));
    const id = store.items()[0].id;
    await store.analyse(id);
    const draft = structuredClone(store.items()[0].draft!);
    draft.account = 'My wallet';
    draft.rows[0].amountMinor = NaN;
    expect(await store.confirm(id, draft)).toBe(false);
    expect(store.items()[0].status).toBe('ready');
    expect(store.confirmed()).toEqual([]);
  });
});
