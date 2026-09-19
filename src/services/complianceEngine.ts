import * as turf from '@turf/turf';
import { GpsPoint, RouteData, VehicleStatus } from '../types';
import { CONFIG } from '../config';

export interface RouteComplianceResult {
  isCompliant: boolean;
  distanceFromRouteMeters: number;
  consecutiveDeviations: number;
  deviationAlert: boolean;
  alertMessage: string | null;
  nearestPointCoords: [number, number] | null;
}

export interface RouteProgressResult {
  completedMeters: number;
  remainingMeters: number;
  totalMeters: number;
  progressPercent: number;
  isArrived: boolean;
}

export interface EtaResult {
  status: 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE' | 'ARRIVED';
  etaMinutes: number | null;
  formattedEta: string;
}

export class ComplianceEngine {
  private consecutiveDeviations: number = 0;
  private consecutiveDeviationsThreshold: number = 2; // Hysteresis: requires 2 consecutive points to trigger alert

  public reset() {
    this.consecutiveDeviations = 0;
  }

  /**
   * Evaluates route deviation using Turf.js orthogonal distance
   */
  public checkCompliance(
    point: GpsPoint | null,
    route: RouteData | null,
    thresholdMeters = CONFIG.ROUTE_DEVIATION_THRESHOLD_METERS
  ): RouteComplianceResult {
    if (!point || !route || !route.route_geojson) {
      return {
        isCompliant: true,
        distanceFromRouteMeters: 0,
        consecutiveDeviations: 0,
        deviationAlert: false,
        alertMessage: null,
        nearestPointCoords: null,
      };
    }

    try {
      const pt = turf.point([point.longitude, point.latitude]);
      const line = turf.lineString(
        (route.route_geojson as any).coordinates || (route.route_geojson as any).geometry?.coordinates
      );

      // Distance from point to line in meters
      const distanceKm = turf.pointToLineDistance(pt, line, { units: 'kilometers' });
      const distanceMeters = Math.round(distanceKm * 1000);

      // Snapped nearest point on route line
      const nearest = turf.nearestPointOnLine(line, pt);
      const nearestCoords = nearest.geometry.coordinates as [number, number];

      const isOutsideCorridor = distanceMeters > thresholdMeters;

      if (isOutsideCorridor) {
        this.consecutiveDeviations++;
      } else {
        // Reset counter when vehicle is back inside corridor
        this.consecutiveDeviations = 0;
      }

      const deviationAlert = this.consecutiveDeviations >= this.consecutiveDeviationsThreshold;
      const alertMessage = deviationAlert
        ? `ROUTE DEVIATION — ${distanceMeters} m FROM ASSIGNED ROUTE`
        : null;

      return {
        isCompliant: !deviationAlert,
        distanceFromRouteMeters: distanceMeters,
        consecutiveDeviations: this.consecutiveDeviations,
        deviationAlert,
        alertMessage,
        nearestPointCoords: nearestCoords,
      };
    } catch (err) {
      console.error('[ComplianceEngine] Evaluation error:', err);
      return {
        isCompliant: true,
        distanceFromRouteMeters: 0,
        consecutiveDeviations: 0,
        deviationAlert: false,
        alertMessage: null,
        nearestPointCoords: null,
      };
    }
  }

  /**
   * Calculates route progress completed and remaining
   */
  public calculateProgress(point: GpsPoint | null, route: RouteData | null): RouteProgressResult {
    if (!point || !route || !route.route_geojson) {
      return {
        completedMeters: 0,
        remainingMeters: route?.distance_meters || 0,
        totalMeters: route?.distance_meters || 0,
        progressPercent: 0,
        isArrived: false,
      };
    }

    try {
      const coords = (route.route_geojson as any).coordinates || (route.route_geojson as any).geometry?.coordinates;
      const line = turf.lineString(coords);
      const totalKm = turf.length(line, { units: 'kilometers' });
      const totalMeters = Math.round(totalKm * 1000);

      const pt = turf.point([point.longitude, point.latitude]);
      const startPt = turf.point(coords[0]);
      const endPt = turf.point(coords[coords.length - 1]);

      // Check distance to destination C
      const distToDestinationKm = turf.distance(pt, endPt, { units: 'kilometers' });
      const distToDestinationM = distToDestinationKm * 1000;

      if (distToDestinationM <= 30) {
        return {
          completedMeters: totalMeters,
          remainingMeters: 0,
          totalMeters,
          progressPercent: 100,
          isArrived: true,
        };
      }

      const nearest = turf.nearestPointOnLine(line, pt);
      const sliced = turf.lineSlice(startPt, nearest, line);
      const completedKm = turf.length(sliced, { units: 'kilometers' });
      const completedMeters = Math.min(totalMeters, Math.round(completedKm * 1000));
      const remainingMeters = Math.max(0, totalMeters - completedMeters);
      const progressPercent = totalMeters > 0 ? Math.min(100, Math.round((completedMeters / totalMeters) * 100)) : 0;

      return {
        completedMeters,
        remainingMeters,
        totalMeters,
        progressPercent,
        isArrived: false,
      };
    } catch {
      return {
        completedMeters: 0,
        remainingMeters: route.distance_meters,
        totalMeters: route.distance_meters,
        progressPercent: 0,
        isArrived: false,
      };
    }
  }

  /**
   * Calculates dynamic ETA based on speed, progress, and stale detection
   */
  public calculateEta(
    progress: RouteProgressResult,
    speedKmh: number | null,
    vehicleStatus: VehicleStatus
  ): EtaResult {
    if (progress.isArrived) {
      return { status: 'ARRIVED', etaMinutes: 0, formattedEta: 'ARRIVED' };
    }

    if (vehicleStatus === 'STALE' || vehicleStatus === 'OFFLINE') {
      return { status: 'UNAVAILABLE', etaMinutes: null, formattedEta: 'ETA UNAVAILABLE' };
    }

    const remainingKm = progress.remainingMeters / 1000;
    if (remainingKm <= 0) {
      return { status: 'ARRIVED', etaMinutes: 0, formattedEta: 'ARRIVED' };
    }

    // If speed is stationary (0 or < 1.5 km/h)
    const effectiveSpeed = (speedKmh && speedKmh >= 1.5) ? speedKmh : 15; // default bike speed 15 km/h for realistic projection

    if (!speedKmh || speedKmh < 1.0) {
      // Bike is stationary -> ETA paused if stationary
      const projectedMinutes = Math.round((remainingKm / 15) * 60);
      return {
        status: 'PAUSED',
        etaMinutes: projectedMinutes,
        formattedEta: `${projectedMinutes} min (PAUSED)`,
      };
    }

    const hours = remainingKm / effectiveSpeed;
    const minutes = Math.max(1, Math.round(hours * 60));

    return {
      status: 'ACTIVE',
      etaMinutes: minutes,
      formattedEta: minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
    };
  }

  /**
   * Determine vehicle status based on timestamp age and deviation
   */
  public evaluateVehicleStatus(
    latestTimestamp: number | null,
    isDeviated: boolean,
    now = Date.now(),
    delayedSec = CONFIG.DELAYED_AFTER_SECONDS,
    staleSec = CONFIG.STALE_AFTER_SECONDS
  ): VehicleStatus {
    if (!latestTimestamp) return 'IDLE';

    const ageSec = (now - latestTimestamp) / 1000;

    if (ageSec > staleSec) {
      return 'STALE';
    }
    if (ageSec > delayedSec) {
      return 'DELAYED';
    }
    if (isDeviated) {
      return 'DEVIATION';
    }
    return 'LIVE';
  }
}

export const complianceEngine = new ComplianceEngine();

