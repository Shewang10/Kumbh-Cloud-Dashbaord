import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceEngine } from '../src/services/complianceEngine';
import { GpsPoint, RouteData } from '../src/types';

describe('Geospatial Route Compliance & Hysteresis Engine', () => {
  let engine: ComplianceEngine;

  // Simple straight west-to-east route across SF Market Street:
  // [-122.4200, 37.7749] -> [-122.4000, 37.7749]
  const mockRoute: RouteData = {
    id: 'route-test-1',
    name: 'Market St Test Corridor',
    vehicle_id: 'CF-BIKE-001',
    origin_lat: 37.7749,
    origin_lng: -122.4200,
    destination_lat: 37.7749,
    destination_lng: -122.4000,
    waypoints: [[-122.4200, 37.7749], [-122.4100, 37.7749], [-122.4000, 37.7749]],
    route_geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4200, 37.7749],
        [-122.4100, 37.7749],
        [-122.4000, 37.7749],
      ],
    },
    distance_meters: 1750,
    estimated_duration_seconds: 360,
    is_active: 1,
  };

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it('detects vehicle point directly on route line', () => {
    const onRoutePoint: GpsPoint = {
      id: 'pt-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7749,
      longitude: -122.4150,
      accuracy: 5,
      speed: 15,
      heading: 90,
    };

    const res = engine.checkCompliance(onRoutePoint, mockRoute, 75);
    expect(res.isCompliant).toBe(true);
    expect(res.distanceFromRouteMeters).toBeLessThan(5);
    expect(res.deviationAlert).toBe(false);
  });

  it('detects vehicle near route inside the 75m corridor', () => {
    // Offset slightly north by ~30 meters (0.0003 deg latitude ≈ 33m)
    const nearRoutePoint: GpsPoint = {
      id: 'pt-2',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7752,
      longitude: -122.4150,
      accuracy: 5,
      speed: 15,
      heading: 90,
    };

    const res = engine.checkCompliance(nearRoutePoint, mockRoute, 75);
    expect(res.isCompliant).toBe(true);
    expect(res.distanceFromRouteMeters).toBeLessThanOrEqual(75);
    expect(res.deviationAlert).toBe(false);
  });

  it('filters single noisy GPS spike outside corridor via hysteresis window', () => {
    // 1st point: ~150 meters off corridor
    const outsidePoint1: GpsPoint = {
      id: 'pt-out-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7765, // ~180m north
      longitude: -122.4150,
      accuracy: 10,
      speed: 15,
      heading: 90,
    };

    const res1 = engine.checkCompliance(outsidePoint1, mockRoute, 75);
    expect(res1.distanceFromRouteMeters).toBeGreaterThan(75);
    expect(res1.consecutiveDeviations).toBe(1);
    // Single point should NOT trigger deviation alert (prevents GPS jitter false alarm)
    expect(res1.deviationAlert).toBe(false);
  });

  it('triggers ROUTE DEVIATION when multiple consecutive points are outside corridor', () => {
    const outsidePoint1: GpsPoint = {
      id: 'pt-out-1',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7765,
      longitude: -122.4150,
      accuracy: 10,
      speed: 15,
      heading: 90,
    };

    const outsidePoint2: GpsPoint = {
      id: 'pt-out-2',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now() + 3000,
      latitude: 37.7768,
      longitude: -122.4140,
      accuracy: 8,
      speed: 16,
      heading: 90,
    };

    engine.checkCompliance(outsidePoint1, mockRoute, 75);
    const res2 = engine.checkCompliance(outsidePoint2, mockRoute, 75);

    expect(res2.consecutiveDeviations).toBe(2);
    expect(res2.deviationAlert).toBe(true);
    expect(res2.isCompliant).toBe(false);
    expect(res2.alertMessage).toContain('ROUTE DEVIATION');
  });

  it('clears deviation alert when vehicle returns inside corridor', () => {
    // 2 consecutive points outside
    const outsidePoint: GpsPoint = {
      id: 'pt-out',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now(),
      latitude: 37.7768,
      longitude: -122.4140,
      accuracy: 5,
      speed: 15,
      heading: 90,
    };

    engine.checkCompliance(outsidePoint, mockRoute, 75);
    engine.checkCompliance(outsidePoint, mockRoute, 75);

    // Return to corridor
    const insidePoint: GpsPoint = {
      id: 'pt-in',
      vehicleId: 'CF-BIKE-001',
      timestamp: Date.now() + 6000,
      latitude: 37.7749,
      longitude: -122.4120,
      accuracy: 5,
      speed: 15,
      heading: 90,
    };

    const resRecovered = engine.checkCompliance(insidePoint, mockRoute, 75);
    expect(resRecovered.isCompliant).toBe(true);
    expect(resRecovered.deviationAlert).toBe(false);
    expect(resRecovered.consecutiveDeviations).toBe(0);
  });
});

