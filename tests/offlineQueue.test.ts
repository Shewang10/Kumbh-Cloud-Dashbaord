import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  enqueueGpsPoint,
  getQueuedGpsPoints,
  removeQueuedGpsPoints,
  getQueueCount,
  clearQueue,
} from '../src/offline/idbQueue';
import { GpsPoint } from '../src/types';

describe('IndexedDB Offline GPS Queue', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  it('enqueues GPS points when offline', async () => {
    const pt1: GpsPoint = {
      id: 'queue-pt-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: 1000,
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      speed: 12,
      heading: 90,
    };

    const pt2: GpsPoint = {
      id: 'queue-pt-2',
      vehicleId: 'CF-BIKE-001',
      timestamp: 2000,
      latitude: 37.7750,
      longitude: -122.4190,
      accuracy: 5,
      speed: 13,
      heading: 95,
    };

    await enqueueGpsPoint(pt1);
    await enqueueGpsPoint(pt2);

    const count = await getQueueCount();
    expect(count).toBe(2);

    const points = await getQueuedGpsPoints(10);
    expect(points.length).toBe(2);
    expect(points[0].id).toBe('queue-pt-1');
    expect(points[1].id).toBe('queue-pt-2');
  });

  it('removes successfully synchronized points from the queue', async () => {
    const pt1: GpsPoint = {
      id: 'queue-pt-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: 1000,
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      speed: 12,
      heading: 90,
    };

    const pt2: GpsPoint = {
      id: 'queue-pt-2',
      vehicleId: 'CF-BIKE-001',
      timestamp: 2000,
      latitude: 37.7750,
      longitude: -122.4190,
      accuracy: 5,
      speed: 13,
      heading: 95,
    };

    await enqueueGpsPoint(pt1);
    await enqueueGpsPoint(pt2);

    // Synchronize pt1 only
    await removeQueuedGpsPoints(['queue-pt-1']);

    const remainingCount = await getQueueCount();
    expect(remainingCount).toBe(1);

    const remainingPoints = await getQueuedGpsPoints(10);
    expect(remainingPoints[0].id).toBe('queue-pt-2');
  });

  it('retains queued points if synchronization fails', async () => {
    const pt: GpsPoint = {
      id: 'queue-pt-fail',
      vehicleId: 'CF-BIKE-001',
      timestamp: 3000,
      latitude: 37.7760,
      longitude: -122.4180,
      accuracy: 6,
      speed: 10,
      heading: 180,
    };

    await enqueueGpsPoint(pt);

    // Simulate failed sync -> removeQueuedGpsPoints is NOT called
    const count = await getQueueCount();
    expect(count).toBe(1);

    const queued = await getQueuedGpsPoints(10);
    expect(queued[0].id).toBe('queue-pt-fail');
  });
});

