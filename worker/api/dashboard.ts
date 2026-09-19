import { Env } from '../types';
import { errorResponse, successResponse } from './gps';

export async function handleDashboardState(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const vehicleId = url.searchParams.get('vehicleId') || env.DEFAULT_VEHICLE_ID || 'CF-BIKE-001';
    const now = Date.now();

    // 1. Fetch or create default vehicle
    let vehicle = await env.DB.prepare(`
      SELECT id, vehicle_code, vehicle_type, name, status, created_at, updated_at
      FROM vehicles WHERE id = ?
    `).bind(vehicleId).first();

    if (!vehicle) {
      await env.DB.prepare(`
        INSERT INTO vehicles (id, vehicle_code, vehicle_type, name, status, created_at, updated_at)
        VALUES (?, ?, 'BIKE', 'CleanFleet Test Bike', 'IDLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(vehicleId, vehicleId).run();

      vehicle = {
        id: vehicleId,
        vehicle_code: vehicleId,
        vehicle_type: 'BIKE',
        name: 'CleanFleet Test Bike',
        status: 'IDLE',
      };
    }

    // 2. Latest GPS point
    const latestGps = await env.DB.prepare(`
      SELECT id, vehicle_id as vehicleId, timestamp, latitude, longitude, accuracy, speed, heading, received_at as receivedAt
      FROM gps_points
      WHERE vehicle_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).bind(vehicleId).first();

    // Determine live/delayed/stale based on thresholds
    const staleThresholdSec = Number(env.STALE_AFTER_SECONDS || 90);
    const delayedThresholdSec = Number(env.DELAYED_AFTER_SECONDS || 30);

    let calculatedStatus = vehicle.status as string;
    if (latestGps) {
      const ageSec = (now - (latestGps.timestamp as number)) / 1000;
      if (ageSec > staleThresholdSec) {
        calculatedStatus = 'STALE';
      } else if (ageSec > delayedThresholdSec) {
        calculatedStatus = 'DELAYED';
      } else {
        calculatedStatus = 'LIVE';
      }
    } else {
      calculatedStatus = 'IDLE';
    }

    // 3. Active Route
    const activeRouteRow = await env.DB.prepare(`
      SELECT * FROM routes WHERE vehicle_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1
    `).bind(vehicleId).first();

    let activeRoute = null;
    if (activeRouteRow) {
      activeRoute = {
        id: activeRouteRow.id,
        name: activeRouteRow.name,
        vehicle_id: activeRouteRow.vehicle_id,
        origin_lat: activeRouteRow.origin_lat,
        origin_lng: activeRouteRow.origin_lng,
        destination_lat: activeRouteRow.destination_lat,
        destination_lng: activeRouteRow.destination_lng,
        waypoints: activeRouteRow.waypoints_json ? JSON.parse(activeRouteRow.waypoints_json as string) : [],
        route_geojson: typeof activeRouteRow.route_geojson === 'string'
          ? JSON.parse(activeRouteRow.route_geojson)
          : activeRouteRow.route_geojson,
        distance_meters: activeRouteRow.distance_meters,
        estimated_duration_seconds: activeRouteRow.estimated_duration_seconds,
        is_active: activeRouteRow.is_active,
        created_at: activeRouteRow.created_at,
      };
    }

    // 4. Recent route events (audit timeline, last 20)
    const eventsResult = await env.DB.prepare(`
      SELECT id, vehicle_id, route_id, event_type, latitude, longitude, distance_from_route, timestamp, metadata
      FROM route_events
      WHERE vehicle_id = ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).bind(vehicleId).all();

    return successResponse({
      vehicle: {
        ...vehicle,
        status: calculatedStatus,
      },
      latestGps,
      activeRoute,
      recentEvents: eventsResult.results || [],
      serverTime: now,
      thresholds: {
        delayedAfterSeconds: delayedThresholdSec,
        staleAfterSeconds: staleThresholdSec,
      },
    });
  } catch (err: any) {
    return errorResponse('DASHBOARD_STATE_FAILED', err.message, 500);
  }
}

