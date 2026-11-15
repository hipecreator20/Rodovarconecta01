import type { FreightDocumentFile, FreightRecord } from '../types/index.ts';

const STORAGE_KEY = 'rodovar_conecta_fretes_financeiro_v1';
const IDB_NAME = 'rodovar_financeiro_files_db';
const IDB_STORE = 'freight_files';
const IDB_VERSION = 1;

export const INITIAL_FREIGHTS: FreightRecord[] = [];

// Open IndexedDB for storing large PDF / Image dataUrls permanently
function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFileDataToIndexedDB(fileId: string, dataUrl: string): Promise<void> {
  try {
    const db = await openFilesDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ id: fileId, dataUrl, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.debug('IndexedDB file save fallback info:', err);
  }
}

export async function getFileDataFromIndexedDB(fileId: string): Promise<string | null> {
  try {
    const db = await openFilesDb();
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(fileId);
      req.onsuccess = () => {
        resolve(req.result?.dataUrl || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function loadFreightsFromStorage(): FreightRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FreightRecord[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.debug('Freight storage load info:', err);
  }
  return [];
}

export function saveFreightsToStorage(freights: FreightRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freights));
  } catch (err) {
    // If localStorage hits quota due to inline dataUrls, strip large dataUrls before saving to localStorage
    // while keeping them safely in IndexedDB
    try {
      const lightweight = freights.map((f) => {
        const cleanDocs: FreightRecord['docs'] = {};
        (Object.keys(f.docs) as Array<keyof FreightRecord['docs']>).forEach((k) => {
          const docItem = f.docs[k];
          if (docItem) {
            if (docItem.dataUrl && docItem.dataUrl.length > 80000) {
              void saveFileDataToIndexedDB(docItem.id, docItem.dataUrl);
              cleanDocs[k] = { ...docItem, dataUrl: undefined };
            } else {
              cleanDocs[k] = docItem;
            }
          }
        });
        return { ...f, docs: cleanDocs };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch (innerErr) {
      console.debug('Freight storage fallback info:', err, innerErr);
    }
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function createFreightDocumentFile(
  file: File,
  type: FreightDocumentFile['type'],
  label: string,
  uploadedBy: string
): Promise<FreightDocumentFile> {
  const dataUrl = await readFileAsDataUrl(file);
  const id = `fdoc-${type.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await saveFileDataToIndexedDB(id, dataUrl);
  const nowStr = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    id,
    type,
    label,
    fileName: file.name,
    mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
    sizeLabel: formatFileSize(file.size),
    uploadedAt: nowStr,
    uploadedBy,
    dataUrl,
  };
}
