import { GpsPoint } from '../types';
import { enqueueGpsPoint, getQueuedGpsPoints, removeQueuedGpsPoints, getQueueCount } from '../offline/idbQueue';
import { api } from '../api/client';
import { CONFIG } from '../config';
import { backgroundAudio } from './backgroundAudioKeepAlive';

export interface TrackerDiagnostics {
  totalPointsCaptured: number;
  totalPointsSynced: number;
  lastSyncAttempt: number | null;
  lastSyncSuccess: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  connectionType?: string | null;
  wakeLockActive?: boolean;
}

export type TrackerStatus = 'STOPPED' | 'STARTING' | 'ACTIVE' | 'OFFLINE' | 'DENIED' | 'ERROR';

export type TrackerListener = (state: {
  status: TrackerStatus;
  currentPoint: GpsPoint | null;
  isOnline: boolean;
  queuedCount: number;
  diagnostics: TrackerDiagnostics;
  syncMessage: string | null;
}) => void;

class GpsTrackerService {
  private watchId: number | null = null;
  private status: TrackerStatus = 'STOPPED';
  private currentPoint: GpsPoint | null = null;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private queuedCount: number = 0;
  private listeners: Set<TrackerListener> = new Set();
  private syncInProgress: boolean = false;
  private syncTimer: any = null;
  private syncMessage: string | null = null;
  private wakeLockSentinel: any = null;
  private diagnostics: TrackerDiagnostics = {
    totalPointsCaptured: 0,
    totalPointsSynced: 0,
    lastSyncAttempt: null,
    lastSyncSuccess: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    batteryLevel: null,
    isCharging: null,
    connectionType: null,
    wakeLockActive: false,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
      this.initBatteryDiagnostics();
      this.refreshQueueCount();
    }
  }

  public subscribe(listener: TrackerListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = {
      status: this.status,
      currentPoint: this.currentPoint,
      isOnline: this.isOnline,
      queuedCount: this.queuedCount,
      diagnostics: { ...this.diagnostics },
      syncMessage: this.syncMessage,
    };
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private async refreshQueueCount(): Promise<number> {
    this.queuedCount = await getQueueCount();
    this.notify();
    return this.queuedCount;
  }

  private async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.diagnostics.wakeLockActive = true;
        this.wakeLockSentinel.addEventListener('release', () => {
          this.diagnostics.wakeLockActive = false;
          this.notify();
        });
        console.log('[Tracker] Screen Wake Lock acquired');
      } catch (err) {
        console.warn('[Tracker] Screen Wake Lock not available:', err);
        this.diagnostics.wakeLockActive = false;
      }
    }
  }

  private async releaseWakeLock() {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
      this.diagnostics.wakeLockActive = false;
    }
  }

  private handleVisibilityChange() {
    if (typeof document === 'undefined') return;

    if (document.visibilityState === 'visible') {
      console.log('[Tracker] App visible: re-syncing and refreshing location');
      // Resume background audio context
      backgroundAudio.resumeIfSuspended();

      // Re-acquire wake lock if currently active
      if (this.status === 'ACTIVE' || this.status === 'OFFLINE') {
        this.requestWakeLock();

        // Force an immediate GPS query so there is zero delay
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => this.handleGpsSuccess(pos),
            (err) => console.warn('[Tracker] Wakeup GPS query failed:', err),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        }

        // Flush any points saved in IndexedDB during sleep
        this.syncQueuedPoints();
      }
    }
  }

  private async initBatteryDiagnostics() {
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        this.diagnostics.batteryLevel = Math.round(battery.level * 100);
        this.diagnostics.isCharging = battery.charging;
        battery.addEventListener('levelchange', () => {
          this.diagnostics.batteryLevel = Math.round(battery.level * 100);
          this.notify();
        });
      }
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        this.diagnostics.connectionType = conn.effectiveType || conn.type;
      }
    } catch {
      // Diagnostics are optional enhancements
    }
  }

  private handleNetworkChange(online: boolean) {
    this.isOnline = online;
    if (online) {
      this.syncMessage = 'Network restored. Synchronizing...';
      if (this.status === 'OFFLINE') {
        this.status = 'ACTIVE';
      }
      this.triggerAutoSync();
    } else {
      if (this.status === 'ACTIVE') {
        this.status = 'OFFLINE';
      }
      this.syncMessage = 'Device offline. Storing points locally.';
    }
    this.notify();
  }

  public async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.status = 'ERROR';
      this.diagnostics.lastErrorCode = 'GEOLOCATION_UNSUPPORTED';
      this.diagnostics.lastErrorMessage = 'Geolocation is not supported by your browser.';
      this.notify();
      return;
    }

    if (this.watchId !== null) {
      return; // Already running
    }

    this.status = 'STARTING';
    this.syncMessage = 'Requesting GPS satellite lock...';
    this.notify();

    // 1. Keep screen awake via Wake Lock API
    await this.requestWakeLock();

    // 2. Start silent audio keep-alive to keep iOS Safari execution thread alive
    backgroundAudio.start();

    try {
      if (this.isOnline) {
        await api.startTracker(CONFIG.VEHICLE_ID).catch(() => {});
      }
    } catch {
      // Ignore tracker start ping failure
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    };

    // Immediate fix
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handleGpsSuccess(pos),
      (err) => console.warn('[Tracker] Immediate GPS fix pending:', err),
      options
    );

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleGpsSuccess(position),
      (error) => this.handleGpsError(error),
      options
    );

    // Schedule regular background sync check
    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.syncQueuedPoints();
      }
    }, 5000);
  }

  public async stop(): Promise<void> {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Release wake lock & background audio session
    await this.releaseWakeLock();
    backgroundAudio.stop();

    this.status = 'STOPPED';
    this.syncMessage = 'Tracking stopped.';
    this.notify();

    if (this.isOnline) {
      try {
        await api.stopTracker(CONFIG.VEHICLE_ID);
      } catch {
        // Ignore stop error
      }
    }
  }

  private async handleGpsSuccess(position: GeolocationPosition) {
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    const timestamp = position.timestamp || Date.now();

    const point: GpsPoint = {
      id: crypto.randomUUID(),
      vehicleId: CONFIG.VEHICLE_ID,
      timestamp,
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      speed: speed !== null && !isNaN(speed) ? Number(speed) : null,
      heading: heading !== null && !isNaN(heading) ? Math.round(heading) : null,
    };

    this.currentPoint = point;
    this.diagnostics.totalPointsCaptured++;
    this.status = this.isOnline ? 'ACTIVE' : 'OFFLINE';
    this.diagnostics.lastErrorCode = null;
    this.diagnostics.lastErrorMessage = null;

    // Send immediately if online, else queue in IndexedDB
    if (this.isOnline) {
      try {
        await api.sendGpsPoint(point);
        this.diagnostics.totalPointsSynced++;
        this.diagnostics.lastSyncSuccess = Date.now();
        this.syncMessage = 'Real-time GPS transmitting';
      } catch (err: any) {
        // Network or API failure -> persist to IndexedDB
        console.warn('[Tracker] Direct send failed, queuing locally:', err);
        await enqueueGpsPoint(point);
        await this.refreshQueueCount();
        this.syncMessage = `Connection hiccup. Queued 1 point.`;
      }
    } else {
      await enqueueGpsPoint(point);
      await this.refreshQueueCount();
      this.syncMessage = `Offline: ${this.queuedCount} points saved locally`;
    }

    this.notify();
  }

  private handleGpsError(error: GeolocationPositionError) {
    console.error('[Tracker] Geolocation error:', error);
    this.diagnostics.lastErrorCode = error.code.toString();
    this.diagnostics.lastErrorMessage = error.message;

    if (error.code === error.PERMISSION_DENIED) {
      this.status = 'DENIED';
      this.syncMessage = 'Location permission denied. Please allow location access in settings.';
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      this.status = 'ERROR';
      this.syncMessage = 'GPS signal unavailable. Move to an open sky area.';
    } else if (error.code === error.TIMEOUT) {
      this.syncMessage = 'GPS acquisition timeout. Retrying...';
    }

    this.notify();
  }

  public async syncQueuedPoints(): Promise<{ synced: number; remaining: number }> {
    if (this.syncInProgress) {
      return { synced: 0, remaining: this.queuedCount };
    }

    const count = await this.refreshQueueCount();
    if (count === 0) {
      return { synced: 0, remaining: 0 };
    }

    this.syncInProgress = true;
    this.diagnostics.lastSyncAttempt = Date.now();
    this.syncMessage = `Syncing ${count} queued points...`;
    this.notify();

    try {
      const batch = await getQueuedGpsPoints(100);
      if (batch.length === 0) {
        this.syncInProgress = false;
        return { synced: 0, remaining: 0 };
      }

      const res = await api.sendGpsBatch(batch);
      const syncedIds = batch.slice(0, res.syncedCount).map((p) => p.id);
      await removeQueuedGpsPoints(syncedIds);

      const remaining = await this.refreshQueueCount();
      this.diagnostics.totalPointsSynced += res.syncedCount;
      this.diagnostics.lastSyncSuccess = Date.now();
      this.syncMessage = remaining === 0
        ? `Sync complete! Uploaded ${res.syncedCount} points.`
        : `Uploaded ${res.syncedCount} points. ${remaining} remaining...`;

      this.syncInProgress = false;
      this.notify();
      return { synced: res.syncedCount, remaining };
    } catch (err: any) {
      console.error('[Tracker] Batch sync failed:', err);
      this.syncInProgress = false;
      this.syncMessage = `Sync failed (${err.message}). Will retry automatically.`;
      this.notify();
      return { synced: 0, remaining: this.queuedCount };
    }
  }

  public triggerAutoSync() {
    setTimeout(() => {
      this.syncQueuedPoints();
    }, 1000);
  }
}

export const trackerService = new GpsTrackerService();
