import type { CacheMetadata, GerconRecord, GerconYear } from '@/types/gercon'

const DB_NAME = 'gercon_poa_multiyear_db'
const DB_VERSION = 1
const CHUNKS_STORE = 'record_chunks'
const META_STORE = 'metadata'
const CHUNK_SIZE = 2500

interface RecordChunkRow {
  id: string
  year: GerconYear
  chunkIndex: number
  records: GerconRecord[]
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' })
        store.createIndex('by_year', 'year', { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'year' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new Error(`Erro ao abrir IndexedDB: ${request.error?.message ?? 'desconhecido'}`))
  })
}

export async function getCacheMetadata(year: GerconYear): Promise<CacheMetadata | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const store = tx.objectStore(META_STORE)
    const req = store.get(year)

    req.onsuccess = () => {
      const result = req.result as CacheMetadata | undefined
      resolve(result ?? null)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function listCachedYears(): Promise<GerconYear[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const store = tx.objectStore(META_STORE)
    const req = store.getAllKeys()

    req.onsuccess = () => {
      const years = (req.result as number[])
        .filter((y) => typeof y === 'number')
        .sort((a, b) => b - a) as GerconYear[]
      resolve(years)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

function deleteChunksForYear(store: IDBObjectStore, year: GerconYear): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = store.index('by_year')
    const range = IDBKeyRange.only(year)
    const cursorReq = index.openCursor(range)

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

export async function saveDatasetToBrowserStorage(
  year: GerconYear,
  records: GerconRecord[],
  meta: CacheMetadata
): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CHUNKS_STORE, META_STORE], 'readwrite')
    const chunkStore = tx.objectStore(CHUNKS_STORE)
    const metaStore = tx.objectStore(META_STORE)

    deleteChunksForYear(chunkStore, year)
      .then(() => {
        let chunkIndex = 0
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          const row: RecordChunkRow = {
            id: `${year}:${chunkIndex}`,
            year,
            chunkIndex,
            records: records.slice(i, i + CHUNK_SIZE),
          }
          chunkStore.put(row)
          chunkIndex++
        }
        metaStore.put(meta)
      })
      .catch(reject)

    tx.oncomplete = () => {
      db.close()
      try {
        localStorage.setItem(`gercon_poa_${year}_meta`, JSON.stringify(meta))
      } catch {
        // Ignora caso localStorage esteja indisponível em modo privado
      }
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error(`Falha ao gravar cache local: ${tx.error?.message ?? 'desconhecido'}`))
    }
  })
}

export async function loadDatasetFromBrowserStorage(year: GerconYear): Promise<{
  records: GerconRecord[]
  meta: CacheMetadata
} | null> {
  const meta = await getCacheMetadata(year)
  if (!meta || meta.recordCount === 0) {
    return null
  }

  const db = await openDatabase()
  const records = await new Promise<GerconRecord[]>((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const index = store.index('by_year')
    const req = index.getAll(IDBKeyRange.only(year))

    req.onsuccess = () => {
      const chunks = (req.result as RecordChunkRow[]).sort((a, b) => a.chunkIndex - b.chunkIndex)
      const all: GerconRecord[] = []
      for (const chunk of chunks) {
        for (const rec of chunk.records) {
          all.push(rec)
        }
      }
      resolve(all)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })

  if (records.length === 0) return null
  return { records, meta }
}

export async function clearYearCache(year: GerconYear): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CHUNKS_STORE, META_STORE], 'readwrite')
    const chunkStore = tx.objectStore(CHUNKS_STORE)
    const metaStore = tx.objectStore(META_STORE)

    deleteChunksForYear(chunkStore, year)
      .then(() => {
        metaStore.delete(year)
      })
      .catch(reject)

    tx.oncomplete = () => {
      db.close()
      try {
        localStorage.removeItem(`gercon_poa_${year}_meta`)
      } catch {
        // ignore
      }
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}
