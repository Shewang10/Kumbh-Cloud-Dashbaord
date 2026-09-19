import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GpsPoint } from '../types';

interface CleanFleetDB extends DBSchema {
  gps_queue: {
    key: string;
    value: GpsPoint;
    indexes: { 'by-timestamp': number };
  };
}

const DB_NAME = 'cleanfleet_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CleanFleetDB>> | null = null;

function getDb(): Promise<IDBPDatabase<CleanFleetDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CleanFleetDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('gps_queue')) {
          const store = db.createObjectStore('gps_queue', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueGpsPoint(point: GpsPoint): Promise<void> {
  try {
    const db = await getDb();
    await db.put('gps_queue', point);
  } catch (err) {
    console.error('[IDB] Failed to enqueue GPS point:', err);
  }
}

export async function getQueuedGpsPoints(limit = 100): Promise<GpsPoint[]> {
  try {
    const db = await getDb();
    const tx = db.transaction('gps_queue', 'readonly');
    const index = tx.store.index('by-timestamp');
    const points: GpsPoint[] = [];

    let cursor = await index.openCursor();
    while (cursor && points.length < limit) {
      points.push(cursor.value);
      cursor = await cursor.continue();
    }
    return points;
  } catch (err) {
    console.error('[IDB] Failed to read GPS queue:', err);
    return [];
  }
}

export async function removeQueuedGpsPoints(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction('gps_queue', 'readwrite');
    for (const id of ids) {
      await tx.store.delete(id);
    }
    await tx.done;
  } catch (err) {
    console.error('[IDB] Failed to remove synced GPS points:', err);
  }
}

export async function getQueueCount(): Promise<number> {
  try {
    const db = await getDb();
    return await db.count('gps_queue');
  } catch (err) {
    console.error('[IDB] Failed to get queue count:', err);
    return 0;
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('gps_queue');
  } catch (err) {
    console.error('[IDB] Failed to clear queue:', err);
  }
}

