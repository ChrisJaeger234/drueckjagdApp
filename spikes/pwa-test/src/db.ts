// Kleine IndexedDB-Hülle für das Testprotokoll und offline gespeicherte Daten.
// In der richtigen App übernimmt das Dexie; hier reicht die Browser-API.

const DB_NAME = 'drueckjagd-pwa-test';
const DB_VERSION = 1;

export interface LogEntry {
  id?: number;
  at: number; // Zeitstempel in ms
  kind: 'gps' | 'visibility' | 'wakelock' | 'report' | 'info' | 'error';
  text: string;
  data?: Record<string, unknown>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('log', { keyPath: 'id', autoIncrement: true }).createIndex('kind', 'kind');
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addLog(entry: Omit<LogEntry, 'at'> & { at?: number }): Promise<void> {
  const db = await open();
  await done(db.transaction('log', 'readwrite').objectStore('log').add({ at: Date.now(), ...entry }));
}

export async function allLogs(kind?: LogEntry['kind']): Promise<LogEntry[]> {
  const db = await open();
  const store = db.transaction('log').objectStore('log');
  return done(kind ? store.index('kind').getAll(kind) : store.getAll()) as Promise<LogEntry[]>;
}

export async function clearLogs(): Promise<void> {
  const db = await open();
  await done(db.transaction('log', 'readwrite').objectStore('log').clear());
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return done(db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const db = await open();
  await done(db.transaction('kv', 'readwrite').objectStore('kv').put(value, key));
}
