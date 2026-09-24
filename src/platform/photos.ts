// Optional "Potem" card photos. Stored ONLY on this device in IndexedDB,
// one per card. Never uploaded: this module has no network code at all.

import type { CardId } from '../i18n';

const DB_NAME = 'budujemy-tor';
const STORE = 'photos';
const MAX_SIDE = 900;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getPhoto(card: CardId): Promise<Blob | null> {
  try {
    return (await run<Blob | undefined>('readonly', (s) => s.get(card))) ?? null;
  } catch {
    return null;
  }
}

export async function savePhoto(card: CardId, file: Blob): Promise<void> {
  await run('readwrite', (s) => s.put(file, card));
}

export async function deletePhoto(card: CardId): Promise<void> {
  await run('readwrite', (s) => s.delete(card));
}

/** Shrink a camera photo so it stays small on the device. Falls back to the original. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return out ?? file;
  } catch {
    return file;
  }
}
