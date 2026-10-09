// Guarda los .pak que eligió el usuario en IndexedDB, para no pedirlos en cada visita.
// Los archivos nunca salen del navegador del usuario.

const DB = 'pegglecito';
const STORE = 'paks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export interface StoredPak {
  name: string;
  bytes: Uint8Array;
}

export async function loadPaks(): Promise<StoredPak[]> {
  try {
    return ((await run('readonly', (s) => s.get('all'))) as StoredPak[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function savePaks(paks: StoredPak[]) {
  try {
    await run('readwrite', (s) => s.put(paks, 'all'));
  } catch {
    // Sin IndexedDB (modo privado, etc.): simplemente no se recuerda.
  }
}

export async function clearPaks() {
  try {
    await run('readwrite', (s) => s.delete('all'));
  } catch {
    // ignorar
  }
}
