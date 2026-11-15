import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AnalysisDraft } from '../../models/analysis';
import { validateDraft } from '../analysis/parse-statement';
import { SavedStatement, Statements } from '../statements/statements';
import { CATEGORIES } from '../../data/categories';

const FORMAT = 'myavailable-encrypted-backup';
const VERSION = 1;
const ITERATIONS = 310_000;
const ADDITIONAL_DATA = new TextEncoder().encode(`${FORMAT}:v${VERSION}`);

export const BACKUP_STORAGE_KEYS = [
  'theme',
  'mysika.profile.v1',
  'mysika.budgets.v1',
  'mysika.goal.v1',
  'mysika.transfer-matches.v1',
  'mysika.transaction-corrections.v1',
] as const;

interface SerializedStatement extends Omit<SavedStatement, 'file'> {
  file: { type: string; data: string };
}

export interface BackupPayload {
  app: 'myAvailable';
  version: 1;
  createdAt: string;
  statements: SerializedStatement[];
  localStorage: Record<string, string>;
}

interface BackupEnvelope {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string; data: string };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + size)));
  }
  return btoa(chunks.join(''));
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error('The backup contains invalid encoded data.');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Could not read a local file for backup.'));
    reader.readAsArrayBuffer(blob);
  });
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected backup file.'));
    reader.readAsText(blob);
  });
}

async function passwordKey(password: string, salt: Uint8Array, usages: KeyUsage[]) {
  const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export async function encryptBackup(payload: BackupPayload, password: string): Promise<BackupEnvelope> {
  if (password.length < 8) throw new Error('Use a backup password with at least 8 characters.');
  if (!crypto?.subtle) throw new Error('Encrypted backup requires HTTPS or localhost.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ['encrypt']);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ADDITIONAL_DATA }, key, plain);
  return {
    format: FORMAT,
    version: VERSION,
    createdAt: payload.createdAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) },
  };
}

export async function decryptBackup(envelope: unknown, password: string): Promise<unknown> {
  if (!envelope || typeof envelope !== 'object') throw new Error('This is not a myAvailable backup file.');
  const value = envelope as Partial<BackupEnvelope>;
  if (value.format !== FORMAT || value.version !== VERSION || value.kdf?.name !== 'PBKDF2' ||
    value.kdf.hash !== 'SHA-256' || value.kdf.iterations !== ITERATIONS || value.cipher?.name !== 'AES-GCM' ||
    typeof value.kdf.salt !== 'string' || typeof value.cipher.iv !== 'string' || typeof value.cipher.data !== 'string') {
    throw new Error('This backup format is not supported.');
  }
  try {
    const salt = base64ToBytes(value.kdf.salt);
    const iv = base64ToBytes(value.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption parameters.');
    const key = await passwordKey(password, salt, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: ADDITIONAL_DATA as BufferSource },
      key,
      base64ToBytes(value.cipher.data) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('This backup') || error.message.startsWith('Invalid'))) throw error;
    throw new Error('That password did not unlock this backup, or the file is damaged.');
  }
}

function validDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validatePayload(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object') throw new Error('The decrypted backup is invalid.');
  const payload = value as Partial<BackupPayload>;
  if (payload.app !== 'myAvailable' || payload.version !== VERSION || !validDate(payload.createdAt) || !Array.isArray(payload.statements) ||
    !payload.localStorage || typeof payload.localStorage !== 'object' || payload.statements.length > environment.maxStatements) {
    throw new Error('The decrypted backup is incomplete or unsupported.');
  }
  const allowedKeys = new Set<string>(BACKUP_STORAGE_KEYS);
  for (const [key, stored] of Object.entries(payload.localStorage)) {
    if (!allowedKeys.has(key) || typeof stored !== 'string' || stored.length > 5_000_000) throw new Error('The backup contains unsupported local settings.');
  }
  if (typeof payload.localStorage['mysika.profile.v1'] !== 'string') throw new Error('The backup does not contain a local profile.');
  validateLocalSettings(payload.localStorage);
  return payload as BackupPayload;
}

function storedJson(storage: Record<string, string>, key: string): unknown {
  const value = storage[key];
  if (value === undefined) return undefined;
  try { return JSON.parse(value); }
  catch { throw new Error('The backup contains invalid local settings.'); }
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20_000 && value.every(item => typeof item === 'string' && item.length <= 500);
}

function validateLocalSettings(storage: Record<string, string>) {
  if (storage['theme'] !== undefined && !['finance', 'finance-dark'].includes(storage['theme'])) throw new Error('The backup contains an invalid theme.');
  const profile = storedJson(storage, 'mysika.profile.v1') as Record<string, unknown> | null;
  if (!profile || typeof profile['name'] !== 'string' || !profile['name'].trim() || profile['name'].length > 60 || profile['currency'] !== 'GHS' ||
    !['understand', 'spend-less', 'history'].includes(String(profile['focus'])) || !validDate(profile['createdAt'])) {
    throw new Error('The backup contains an invalid local profile.');
  }
  const budgets = storedJson(storage, 'mysika.budgets.v1');
  if (budgets !== undefined && (!Array.isArray(budgets) || budgets.length > Object.keys(CATEGORIES).length || budgets.some(item =>
    !item || typeof item !== 'object' || !(item.category in CATEGORIES) || !Number.isFinite(item.limit) || item.limit < 0))) {
    throw new Error('The backup contains invalid budgets.');
  }
  const goal = storedJson(storage, 'mysika.goal.v1') as Record<string, unknown> | undefined;
  if (goal !== undefined && (!goal || typeof goal['name'] !== 'string' || goal['name'].length > 120 ||
    typeof goal['target'] !== 'number' || !Number.isFinite(goal['target']) || goal['target'] < 0 ||
    typeof goal['saved'] !== 'number' || !Number.isFinite(goal['saved']) || goal['saved'] < 0)) {
    throw new Error('The backup contains an invalid savings goal.');
  }
  const transfers = storedJson(storage, 'mysika.transfer-matches.v1') as Record<string, unknown> | undefined;
  if (transfers !== undefined && (!transfers || !stringList(transfers['confirmed']) || !stringList(transfers['dismissed']))) {
    throw new Error('The backup contains invalid transfer decisions.');
  }
  const corrections = storedJson(storage, 'mysika.transaction-corrections.v1') as Record<string, unknown> | undefined;
  if (corrections !== undefined) {
    const overrides = corrections?.['overrides'];
    const rules = corrections?.['rules'];
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).length > 20_000 ||
      Object.values(overrides).some(category => typeof category !== 'string' || !(category in CATEGORIES)) || !Array.isArray(rules) || rules.length > 5_000 ||
      rules.some(rule => !rule || typeof rule !== 'object' || typeof rule.key !== 'string' || typeof rule.counterparty !== 'string' ||
        !['in', 'out'].includes(rule.direction) || typeof rule.category !== 'string' || !(rule.category in CATEGORIES))) {
      throw new Error('The backup contains invalid category corrections.');
    }
  }
}

function validateStatement(value: SerializedStatement, ids: Set<string>): SavedStatement {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || ids.has(value.id) ||
    typeof value.name !== 'string' || !value.name || value.name.length > 255 || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > environment.maxStatementBytes ||
    !['pdf', 'csv'].includes(value.kind) || !validDate(value.addedAt) || !['awaiting-analysis', 'ready', 'confirmed', 'error'].includes(value.status) ||
    !value.file || typeof value.file.type !== 'string' || typeof value.file.data !== 'string') {
    throw new Error('The backup contains an invalid statement record.');
  }
  const estimatedBytes = Math.floor(value.file.data.length * 3 / 4);
  if (estimatedBytes > environment.maxStatementBytes + 2) throw new Error('A statement in the backup is too large.');
  const bytes = base64ToBytes(value.file.data);
  if (bytes.length !== value.size) throw new Error('A statement file in the backup is incomplete.');
  if (value.analysisError !== undefined && (typeof value.analysisError !== 'string' || value.analysisError.length > 10_000)) throw new Error('A statement contains an invalid analysis error.');
  if (value.draft) validateDraft(value.draft as AnalysisDraft, value.status === 'confirmed');
  if ((value.status === 'confirmed' || value.status === 'ready') && !value.draft) throw new Error('A reviewed statement is missing its transactions.');
  ids.add(value.id);
  const { file: _file, ...record } = value;
  const fileBytes = new Uint8Array(bytes.byteLength);
  fileBytes.set(bytes);
  return { ...record, file: new Blob([fileBytes.buffer], { type: value.file.type }) };
}

@Injectable({ providedIn: 'root' })
export class DataBackup {
  private readonly statements = inject(Statements);

  async create(password: string): Promise<Blob> {
    const records = await this.statements.exportAll();
    const serialized: SerializedStatement[] = [];
    for (const record of records) {
      const { file, ...rest } = record;
      serialized.push({ ...rest, file: { type: file.type, data: bytesToBase64(await blobBytes(file)) } });
    }
    const local: Record<string, string> = {};
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) local[key] = value;
    }
    const createdAt = new Date().toISOString();
    const envelope = await encryptBackup({ app: 'myAvailable', version: 1, createdAt, statements: serialized, localStorage: local }, password);
    return new Blob([JSON.stringify(envelope)], { type: 'application/vnd.myavailable.backup+json' });
  }

  async download(password: string) {
    const blob = await this.create(password);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myavailable-backup-${new Date().toISOString().slice(0, 10)}.mya`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async restore(file: File | Blob, password: string) {
    if (!file.size) throw new Error('Choose a backup file that is not empty.');
    let envelope: unknown;
    try { envelope = JSON.parse(await blobText(file)); }
    catch { throw new Error('This is not a readable myAvailable backup file.'); }
    const payload = validatePayload(await decryptBackup(envelope, password));
    const ids = new Set<string>();
    const restored = payload.statements.map(statement => validateStatement(statement, ids));

    const previousStatements = await this.statements.exportAll();
    const previousStorage: Record<string, string> = {};
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) previousStorage[key] = value;
    }
    try {
      await this.statements.replaceAll(restored);
      this.replaceLocalStorage(payload.localStorage);
    } catch (error) {
      try { await this.statements.replaceAll(previousStatements); this.replaceLocalStorage(previousStorage); } catch { /* Best-effort rollback. */ }
      throw error;
    }
    return { statements: restored.length, createdAt: payload.createdAt };
  }

  async clearAll() {
    await this.statements.clearAll();
    for (const key of BACKUP_STORAGE_KEYS) localStorage.removeItem(key);
  }

  private replaceLocalStorage(values: Record<string, string>) {
    for (const key of BACKUP_STORAGE_KEYS) {
      const value = values[key];
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }
}
