import { Env, ApiResponse } from '../types';

export function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse(
    {
      success: false,
      data: null,
      error: { code, message },
    },
    status
  );
}

export function successResponse<T>(data: T, status = 200): Response {
  return jsonResponse(
    {
      success: true,
      data,
      error: null,
    },
    status
  );
}

interface RawGpsPayload {
  id?: string;
  vehicleId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
}

function isValidGps(point: RawGpsPayload): boolean {
  if (!point || typeof point !== 'object') return false;
  if (!point.vehicleId || typeof point.vehicleId !== 'string') return false;
  if (typeof point.latitude !== 'number' || point.latitude < -90 || point.latitude > 90) return false;
  if (typeof point.longitude !== 'number' || point.longitude < -180 || point.longitude > 180) return false;
  if (typeof point.timestamp !== 'number' || point.timestamp <= 0) return false;
  if (point.accuracy !== undefined && point.accuracy !== null && point.accuracy < 0) return false;
  return true;
}

export async function handleTrackerStart(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { vehicleId?: string };
    const vehicleId = body.vehicleId || env.DEFAULT_VEHICLE_ID || 'CF-BIKE-001';
    const now = Date.now();

    // Ensure vehicle exists and update status to LIVE
    await env.DB.prepare(`
      INSERT INTO vehicles (id, vehicle_code, vehicle_type, name, status, updated_at)
      VALUES (?, ?, 'BIKE', 'CleanFleet Test Bike', 'LIVE', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
    `).bind(vehicleId, vehicleId).run();

    // Log tracker start event
    await env.DB.prepare(`
      INSERT INTO route_events (id, vehicle_id, event_type, timestamp, metadata)
      VALUES (?, ?, 'TRACKER_START', ?, ?)
    `).bind(crypto.randomUUID(), vehicleId, now, JSON.stringify({ source: 'tracker' })).run();

    return successResponse({ vehicleId, status: 'LIVE', startedAt: now });
  } catch (err: any) {
    return errorResponse('START_FAILED', err.message || 'Failed to start tracker', 500);
  }
}

export async function handleTrackerStop(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { vehicleId?: string };
    const vehicleId = body.vehicleId || env.DEFAULT_VEHICLE_ID || 'CF-BIKE-001';
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE vehicles SET status = 'STALE', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(vehicleId).run();

    await env.DB.prepare(`
      INSERT INTO route_events (id, vehicle_id, event_type, timestamp, metadata)
      VALUES (?, ?, 'TRACKER_STOPPED', ?, ?)
    `).bind(crypto.randomUUID(), vehicleId, now, JSON.stringify({ source: 'tracker' })).run();

    return successResponse({ vehicleId, status: 'STALE', stoppedAt: now });
  } catch (err: any) {
    return errorResponse('STOP_FAILED', err.message || 'Failed to stop tracker', 500);
  }
}

export async function handleGpsPoint(request: Request, env: Env): Promise<Response> {
  try {
    const point = await request.json() as RawGpsPayload;
    if (!isValidGps(point)) {
      return errorResponse('INVALID_GPS_DATA', 'Invalid coordinate, timestamp, or vehicle ID', 400);
    }

    const receivedAt = Date.now();
    const pointId = point.id || crypto.randomUUID();

    // Ensure vehicle exists
    await env.DB.prepare(`
      INSERT INTO vehicles (id, vehicle_code, vehicle_type, name, status, updated_at)
      VALUES (?, ?, 'BIKE', 'CleanFleet Test Bike', 'LIVE', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
    `).bind(point.vehicleId, point.vehicleId).run();

    // Insert point
    await env.DB.prepare(`
      INSERT INTO gps_points (id, vehicle_id, timestamp, latitude, longitude, accuracy, speed, heading, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      pointId,
      point.vehicleId,
      point.timestamp,
      point.latitude,
      point.longitude,
      point.accuracy ?? null,
      point.speed ?? null,
      point.heading ?? null,
      receivedAt
    ).run();

    return successResponse({
      id: pointId,
      vehicleId: point.vehicleId,
      receivedAt,
    });
  } catch (err: any) {
    return errorResponse('GPS_INSERT_FAILED', err.message || 'Database error during GPS insertion', 500);
  }
}

export async function handleGpsBatch(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { points: RawGpsPayload[] };
    if (!body || !Array.isArray(body.points) || body.points.length === 0) {
      return errorResponse('INVALID_BATCH', 'Payload must contain a non-empty points array', 400);
    }

    const points = body.points;
    const receivedAt = Date.now();
    const validPoints: RawGpsPayload[] = [];

    for (const pt of points) {
      if (isValidGps(pt)) {
        validPoints.push(pt);
      }
    }

    if (validPoints.length === 0) {
      return errorResponse('NO_VALID_POINTS', 'None of the provided points are valid', 400);
    }

    const vehicleId = validPoints[0].vehicleId;

    // Build statement batch for D1 atomic execution
    const statements: D1PreparedStatement[] = [];

    // Ensure vehicle exists
    statements.push(
      env.DB.prepare(`
        INSERT INTO vehicles (id, vehicle_code, vehicle_type, name, status, updated_at)
        VALUES (?, ?, 'BIKE', 'CleanFleet Test Bike', 'LIVE', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP
      `).bind(vehicleId, vehicleId)
    );

    // Insert each GPS point
    for (const pt of validPoints) {
      const id = pt.id || crypto.randomUUID();
      statements.push(
        env.DB.prepare(`
          INSERT INTO gps_points (id, vehicle_id, timestamp, latitude, longitude, accuracy, speed, heading, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          pt.vehicleId,
          pt.timestamp,
          pt.latitude,
          pt.longitude,
          pt.accuracy ?? null,
          pt.speed ?? null,
          pt.heading ?? null,
          receivedAt
        )
      );
    }

    // Insert sync event
    statements.push(
      env.DB.prepare(`
        INSERT INTO route_events (id, vehicle_id, event_type, timestamp, metadata)
        VALUES (?, ?, 'OFFLINE_SYNC', ?, ?)
      `).bind(
        crypto.randomUUID(),
        vehicleId,
        receivedAt,
        JSON.stringify({ syncedCount: validPoints.length })
      )
    );

    // Execute in one batch
    await env.DB.batch(statements);

    return successResponse({
      syncedCount: validPoints.length,
      totalReceived: points.length,
      receivedAt,
    });
  } catch (err: any) {
    return errorResponse('BATCH_SYNC_FAILED', err.message || 'Batch sync failed in D1', 500);
  }
}

export async function handleGetLatestGps(vehicleId: string, env: Env): Promise<Response> {
  try {
    const row = await env.DB.prepare(`
      SELECT id, vehicle_id as vehicleId, timestamp, latitude, longitude, accuracy, speed, heading, received_at as receivedAt
      FROM gps_points
      WHERE vehicle_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).bind(vehicleId).first();

    return successResponse(row);
  } catch (err: any) {
    return errorResponse('FETCH_LATEST_FAILED', err.message, 500);
  }
}

export async function handleGetHistory(vehicleId: string, env: Env): Promise<Response> {
  try {
    const results = await env.DB.prepare(`
      SELECT id, vehicle_id as vehicleId, timestamp, latitude, longitude, accuracy, speed, heading, received_at as receivedAt
      FROM gps_points
      WHERE vehicle_id = ?
      ORDER BY timestamp DESC
      LIMIT 200
    `).bind(vehicleId).all();

    return successResponse(results.results || []);
  } catch (err: any) {
    return errorResponse('FETCH_HISTORY_FAILED', err.message, 500);
  }
}

