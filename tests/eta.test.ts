import { describe, it, expect } from 'vitest';
import { ComplianceEngine, RouteProgressResult } from '../src/services/complianceEngine';

describe('ETA and Progress Calculations', () => {
  const engine = new ComplianceEngine();

  it('calculates accurate ETA for moving vehicle', () => {
    const progress: RouteProgressResult = {
      completedMeters: 5000,
      remainingMeters: 5000, // 5 km remaining
      totalMeters: 10000,
      progressPercent: 50,
      isArrived: false,
    };

    // Vehicle moving at 20 km/h -> 5 km remaining should take 15 minutes (5 / 20 * 60)
    const eta = engine.calculateEta(progress, 20, 'LIVE');
    expect(eta.status).toBe('ACTIVE');
    expect(eta.etaMinutes).toBe(15);
    expect(eta.formattedEta).toBe('15 min');
  });

  it('marks ETA as PAUSED when vehicle is stationary', () => {
    const progress: RouteProgressResult = {
      completedMeters: 3000,
      remainingMeters: 3000, // 3 km remaining
      totalMeters: 6000,
      progressPercent: 50,
      isArrived: false,
    };

    // Speed is 0 or stationary
    const eta = engine.calculateEta(progress, 0, 'LIVE');
    expect(eta.status).toBe('PAUSED');
    expect(eta.formattedEta).toContain('PAUSED');
  });

  it('marks ETA as UNAVAILABLE when vehicle is STALE or OFFLINE', () => {
    const progress: RouteProgressResult = {
      completedMeters: 2000,
      remainingMeters: 4000,
      totalMeters: 6000,
      progressPercent: 33,
      isArrived: false,
    };

    const eta = engine.calculateEta(progress, 15, 'STALE');
    expect(eta.status).toBe('UNAVAILABLE');
    expect(eta.formattedEta).toBe('ETA UNAVAILABLE');
  });

  it('marks ETA as ARRIVED when route is complete', () => {
    const progress: RouteProgressResult = {
      completedMeters: 10000,
      remainingMeters: 0,
      totalMeters: 10000,
      progressPercent: 100,
      isArrived: true,
    };

    const eta = engine.calculateEta(progress, 0, 'LIVE');
    expect(eta.status).toBe('ARRIVED');
    expect(eta.formattedEta).toBe('ARRIVED');
  });
});

