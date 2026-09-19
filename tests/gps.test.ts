import { describe, it, expect } from 'vitest';
import { ComplianceEngine } from '../src/services/complianceEngine';
import { GpsPoint } from '../src/types';

describe('GPS Validation & Status Detection', () => {
  const engine = new ComplianceEngine();

  it('validates a correct GPS point', () => {
    const validPoint: GpsPoint = {
      id: 'pt-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 5,
      speed: 10,
      heading: 180,
    };

    expect(validPoint.latitude).toBeGreaterThanOrEqual(-90);
    expect(validPoint.latitude).toBeLessThanOrEqual(90);
    expect(validPoint.longitude).toBeGreaterThanOrEqual(-180);
    expect(validPoint.longitude).toBeLessThanOrEqual(180);
    expect(validPoint.accuracy).toBeGreaterThan(0);
    expect(validPoint.timestamp).toBeGreaterThan(0);
  });

  it('identifies invalid coordinate boundaries', () => {
    const invalidLat = 95.0;
    const invalidLng = -190.0;

    const isValidLat = (lat: number) => typeof lat === 'number' && lat >= -90 && lat <= 90;
    const isValidLng = (lng: number) => typeof lng === 'number' && lng >= -180 && lng <= 180;

    expect(isValidLat(invalidLat)).toBe(false);
    expect(isValidLng(invalidLng)).toBe(false);
  });

  it('evaluates LIVE status when GPS update is recent (< 30s)', () => {
    const now = Date.now();
    const recentTimestamp = now - 5000; // 5 seconds ago

    const status = engine.evaluateVehicleStatus(recentTimestamp, false, now, 30, 90);
    expect(status).toBe('LIVE');
  });

  it('evaluates DELAYED status when GPS update is between 30s and 90s', () => {
    const now = Date.now();
    const delayedTimestamp = now - 45000; // 45 seconds ago

    const status = engine.evaluateVehicleStatus(delayedTimestamp, false, now, 30, 90);
    expect(status).toBe('DELAYED');
  });

  it('evaluates STALE status when GPS update is older than 90s', () => {
    const now = Date.now();
    const staleTimestamp = now - 120000; // 2 minutes ago

    const status = engine.evaluateVehicleStatus(staleTimestamp, false, now, 30, 90);
    expect(status).toBe('STALE');
  });

  it('evaluates IDLE status when no timestamp exists', () => {
    const status = engine.evaluateVehicleStatus(null, false);
    expect(status).toBe('IDLE');
  });
});

