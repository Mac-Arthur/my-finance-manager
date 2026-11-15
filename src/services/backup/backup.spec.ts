import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { vi } from 'vitest';
import { parseCsv } from '../analysis/parse-statement';
import { SavedStatement, Statements } from '../statements/statements';
import { BACKUP_STORAGE_KEYS, BackupPayload, DataBackup, decryptBackup, encryptBackup } from './backup';

function readBlob(blob: Blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('Encrypted local backup', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('authenticates the password and encrypted payload', async () => {
    const payload: BackupPayload = {
      app: 'myAvailable', version: 1, createdAt: '2026-11-14T00:00:00.000Z', statements: [],
      localStorage: { 'mysika.profile.v1': '{"name":"Ama"}' },
    };
    const envelope = await encryptBackup(payload, 'correct horse');
    await expect(decryptBackup(envelope, 'correct horse')).resolves.toEqual(payload);
    await expect(decryptBackup(envelope, 'wrong password')).rejects.toThrow(/password|damaged/i);
  });

  it('restores statements, files and local preferences exactly after clearing', async () => {
    const statements = TestBed.inject(Statements);
    const backup = TestBed.inject(DataBackup);
    const draft = parseCsv('date,name,amount,balance,id\n2026-11-01,Food,-10,90,A');
    draft.account = 'MTN MoMo ••1111';
    const original: SavedStatement = {
      id: 'statement-one', name: 'wallet.csv', size: 17, kind: 'csv', addedAt: '2026-11-14T00:00:00.000Z',
      status: 'confirmed', draft, file: new Blob(['private statement'], { type: 'text/csv' }),
    };
    await statements.replaceAll([original]);
    storage.set('mysika.profile.v1', JSON.stringify({ name: 'Ama', focus: 'history', currency: 'GHS', createdAt: '2026-11-01T00:00:00.000Z' }));
    storage.set('mysika.transaction-corrections.v1', JSON.stringify({ overrides: { A: 'food' }, rules: [] }));

    const encrypted = await backup.create('safe password');
    await backup.clearAll();
    expect(await statements.exportAll()).toEqual([]);
    expect(storage.size).toBe(0);

    const result = await backup.restore(encrypted, 'safe password');
    const restored = await statements.exportAll();
    expect(result.statements).toBe(1);
    expect(restored[0].draft).toEqual(draft);
    expect(await readBlob(restored[0].file)).toBe('private statement');
    expect(storage.get('mysika.transaction-corrections.v1')).toContain('food');
    expect(storage.get('mysika.profile.v1')).toContain('Ama');
  });

  it('clears every managed local key', async () => {
    const backup = TestBed.inject(DataBackup);
    for (const key of BACKUP_STORAGE_KEYS) storage.set(key, 'saved');
    await backup.clearAll();
    expect([...storage.keys()]).toEqual([]);
  });
});
