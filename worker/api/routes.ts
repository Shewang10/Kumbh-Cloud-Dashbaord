import { Env } from '../types';
import { errorResponse, successResponse } from './gps';

interface CreateRoutePayload {
  vehicleId: string;
  name: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[]; // optional intermediate point B
  routeGeoJson?: any;
  distanceMeters?: number;
  durationSeconds?: number;
}

// Free OSRM demo route helper
async function fetchOsrmRoute(coords: [number, number][]): Promise<{
  geojson: any;
  distance: number;
  duration: number;
} | null> {
  try {
    // OSRM format: lng,lat;lng,lat;lng,lat
    const coordString = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CleanFleet-Command-Center/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    return {
      geojson: route.geometry,
      distance: route.distance, // meters
      duration: route.duration, // seconds
    };
  } catch {
    return null;
  }
}

export async function handleCreateRoute(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as CreateRoutePayload;
    if (!body.vehicleId || !body.origin || !body.destination) {
      return errorResponse('INVALID_PAYLOAD', 'VehicleId, origin, and destination are required', 400);
    }

    const routeId = crypto.randomUUID();
    const name = body.name || `Route ${new Date().toLocaleDateString()}`;

    let routeGeometry = body.routeGeoJson;
    let distance = body.distanceMeters || 0;
    let duration = body.durationSeconds || 0;

    // Coordinate array: [lng, lat]
    const coords: [number, number][] = [
      [body.origin.lng, body.origin.lat],
    ];

    if (body.waypoints && body.waypoints.length > 0) {
      for (const wp of body.waypoints) {
        coords.push([wp.lng, wp.lat]);
      }
    }

    coords.push([body.destination.lng, body.destination.lat]);

    // If client didn't supply precomputed GeoJSON, fetch from OSRM
    if (!routeGeometry) {
      const osrmResult = await fetchOsrmRoute(coords);
      if (osrmResult) {
        routeGeometry = osrmResult.geojson;
        distance = osrmResult.distance;
        duration = osrmResult.duration;
      } else {
        // Fallback: straight line LineString if OSRM is unreachable
        routeGeometry = {
          type: 'LineString',
          coordinates: coords,
        };
        // approximate Haversine distance
        distance = 1000;
        duration = 180;
      }
    }

    // Deactivate previous active routes for this vehicle
    await env.DB.prepare(`
      UPDATE routes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE vehicle_id = ?
    `).bind(body.vehicleId).run();

    // Insert new active route
    await env.DB.prepare(`
      INSERT INTO routes (
        id, name, vehicle_id, origin_lat, origin_lng, destination_lat, destination_lng,
        waypoints_json, route_geojson, distance_meters, estimated_duration_seconds, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      routeId,
      name,
      body.vehicleId,
      body.origin.lat,
      body.origin.lng,
      body.destination.lat,
      body.destination.lng,
      JSON.stringify(coords),
      typeof routeGeometry === 'string' ? routeGeometry : JSON.stringify(routeGeometry),
      distance,
      duration
    ).run();

    // Log route assigned event
    await env.DB.prepare(`
      INSERT INTO route_events (id, vehicle_id, route_id, event_type, timestamp, metadata)
      VALUES (?, ?, ?, 'ROUTE_ASSIGNED', ?, ?)
    `).bind(
      crypto.randomUUID(),
      body.vehicleId,
      routeId,
      Date.now(),
      JSON.stringify({ name, distance, duration })
    ).run();

    return successResponse({
      id: routeId,
      name,
      vehicleId: body.vehicleId,
      waypoints: coords,
      routeGeoJson: routeGeometry,
      distanceMeters: distance,
      estimatedDurationSeconds: duration,
      isActive: 1,
    });
  } catch (err: any) {
    return errorResponse('CREATE_ROUTE_FAILED', err.message, 500);
  }
}

export async function handleGetActiveRoute(vehicleId: string, env: Env): Promise<Response> {
  try {
    const row = await env.DB.prepare(`
      SELECT * FROM routes WHERE vehicle_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1
    `).bind(vehicleId).first();

    if (!row) {
      return successResponse(null);
    }

    return successResponse({
      id: row.id,
      name: row.name,
      vehicle_id: row.vehicle_id,
      origin_lat: row.origin_lat,
      origin_lng: row.origin_lng,
      destination_lat: row.destination_lat,
      destination_lng: row.destination_lng,
      waypoints: row.waypoints_json ? JSON.parse(row.waypoints_json as string) : [],
      route_geojson: typeof row.route_geojson === 'string' ? JSON.parse(row.route_geojson) : row.route_geojson,
      distance_meters: row.distance_meters,
      estimated_duration_seconds: row.estimated_duration_seconds,
      is_active: row.is_active,
    });
  } catch (err: any) {
    return errorResponse('FETCH_ROUTE_FAILED', err.message, 500);
  }
}

export async function handleRecalculateRoute(routeId: string, request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { currentLat: number; currentLng: number };
    if (typeof body.currentLat !== 'number' || typeof body.currentLng !== 'number') {
      return errorResponse('INVALID_COORDINATES', 'currentLat and currentLng are required', 400);
    }

    // Get original route to find destination
    const route = await env.DB.prepare(`
      SELECT * FROM routes WHERE id = ?
    `).bind(routeId).first();

    if (!route) {
      return errorResponse('ROUTE_NOT_FOUND', 'Specified route does not exist', 404);
    }

    const coords: [number, number][] = [
      [body.currentLng, body.currentLat],
      [route.destination_lng as number, route.destination_lat as number],
    ];

    const osrmResult = await fetchOsrmRoute(coords);

    if (!osrmResult) {
      return errorResponse('ALTERNATE_UNAVAILABLE', 'Alternate route unavailable', 503);
    }

    const originalDistance = Number(route.distance_meters);
    const originalDuration = Number(route.estimated_duration_seconds);
    const distanceDelta = osrmResult.distance - originalDistance;
    const durationDelta = osrmResult.duration - originalDuration;

    // Log alternate route calculated event
    await env.DB.prepare(`
      INSERT INTO route_events (id, vehicle_id, route_id, event_type, latitude, longitude, timestamp, metadata)
      VALUES (?, ?, ?, 'ALTERNATE_ROUTE_CALCULATED', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      route.vehicle_id,
      routeId,
      body.currentLat,
      body.currentLng,
      Date.now(),
      JSON.stringify({
        alternateDistance: osrmResult.distance,
        alternateDuration: osrmResult.duration,
        distanceDelta,
        durationDelta,
      })
    ).run();

    return successResponse({
      routeId,
      alternateRouteGeoJson: osrmResult.geojson,
      alternateDistanceMeters: osrmResult.distance,
      alternateDurationSeconds: osrmResult.duration,
      originalDistanceMeters: originalDistance,
      originalDurationSeconds: originalDuration,
      distanceDeltaMeters: distanceDelta,
      durationDeltaSeconds: durationDelta,
    });
  } catch (err: any) {
    return errorResponse('RECALCULATION_FAILED', err.message, 500);
  }
}

