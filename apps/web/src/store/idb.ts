// Partidas guardadas en IndexedDB, comprimidas con gzip (una partida mundial supera los 100 MB en JSON).
const DB = 'pitchside';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function gunzip(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * Stores the gzip bytes inline as an ArrayBuffer. Blobs in IndexedDB live in separate files
 * that can go missing (a reload during the write leaves an unreadable entry: "Failed to fetch").
 */
export async function saveText(key: string, text: string): Promise<void> {
  const bytes = await (await gzip(text)).arrayBuffer();
  await tx('readwrite', (s) => s.put({ gz: bytes, savedAt: Date.now() }, key));
}

export async function loadText(key: string): Promise<string | null> {
  const v = await tx<unknown>('readonly', (s) => s.get(key));
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Blob) return gunzip(v);
  const gz = (v as { gz?: ArrayBuffer }).gz;
  return gz ? gunzip(new Blob([gz])) : null;
}

export async function saveKeys(): Promise<string[]> {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  return keys.map(String);
}
