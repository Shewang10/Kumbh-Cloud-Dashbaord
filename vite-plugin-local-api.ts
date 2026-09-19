import type { Plugin } from 'vite';

interface GpsPoint {
  id: string;
  vehicleId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  receivedAt: number;
}

interface RouteEvent {
  id: string;
  vehicle_id: string;
  route_id?: string | null;
  event_type: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_from_route?: number | null;
  timestamp: number;
  metadata?: string | null;
}

export function localApiPlugin(): Plugin {
  // In-memory state for local Vite development
  const vehicleState = {
    id: 'CF-BIKE-001',
    vehicle_code: 'CF-BIKE-001',
    vehicle_type: 'BIKE',
    name: 'CleanFleet Test Bike',
    status: 'IDLE',
  };

  const gpsHistory: GpsPoint[] = [];
  let activeRoute: any = null;
  const recentEvents: RouteEvent[] = [
    {
      id: 'evt-init',
      vehicle_id: 'CF-BIKE-001',
      event_type: 'GPS_ACTIVE',
      timestamp: Date.now() - 60000,
      metadata: JSON.stringify({ source: 'system_init' }),
    },
  ];

  return {
    name: 'cleanfleet-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const path = url.pathname.replace(/\/$/, '');
        const method = req.method?.toUpperCase();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const sendJson = (data: any, status = 200) => {
          res.statusCode = status;
          res.end(JSON.stringify(data));
        };

        const getBody = async (): Promise<any> => {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                resolve(body ? JSON.parse(body) : {});
              } catch {
                resolve({});
              }
            });
          });
        };

        // 1. Health
        if (path === '/api/health' && method === 'GET') {
          return sendJson({
            success: true,
            data: {
              status: 'healthy',
              database: 'ONLINE',
              mode: 'local_vite_engine',
              version: '1.0.0',
              time: Date.now(),
            },
            error: null,
          });
        }

        // 2. Tracker Start / Stop
        if (path === '/api/tracker/start' && method === 'POST') {
          vehicleState.status = 'LIVE';
          recentEvents.unshift({
            id: `evt-${Date.now()}`,
            vehicle_id: vehicleState.id,
            event_type: 'TRACKER_START',
            timestamp: Date.now(),
            metadata: JSON.stringify({ source: 'tracker' }),
          });
          return sendJson({
            success: true,
            data: { vehicleId: vehicleState.id, status: 'LIVE', startedAt: Date.now() },
            error: null,
          });
        }

        if (path === '/api/tracker/stop' && method === 'POST') {
          vehicleState.status = 'STALE';
          recentEvents.unshift({
            id: `evt-${Date.now()}`,
            vehicle_id: vehicleState.id,
            event_type: 'TRACKER_STOPPED',
            timestamp: Date.now(),
            metadata: JSON.stringify({ source: 'tracker' }),
          });
          return sendJson({
            success: true,
            data: { vehicleId: vehicleState.id, status: 'STALE', stoppedAt: Date.now() },
            error: null,
          });
        }

        // 3. Single GPS
        if (path === '/api/gps' && method === 'POST') {
          const body = await getBody();
          const point: GpsPoint = {
            id: body.id || `pt-${Date.now()}`,
            vehicleId: body.vehicleId || vehicleState.id,
            timestamp: body.timestamp || Date.now(),
            latitude: body.latitude,
            longitude: body.longitude,
            accuracy: body.accuracy || 5,
            speed: body.speed !== undefined ? body.speed : null,
            heading: body.heading !== undefined ? body.heading : null,
            receivedAt: Date.now(),
          };

          gpsHistory.unshift(point);
          if (gpsHistory.length > 300) gpsHistory.pop();

          vehicleState.status = 'LIVE';

          return sendJson({
            success: true,
            data: { id: point.id, vehicleId: point.vehicleId, receivedAt: point.receivedAt },
            error: null,
          });
        }

        // 4. Batch GPS
        if (path === '/api/gps/batch' && method === 'POST') {
          const body = await getBody();
          const points = body.points || [];
          const now = Date.now();

          for (const pt of points) {
            gpsHistory.unshift({
              id: pt.id || `pt-${Math.random()}`,
              vehicleId: pt.vehicleId || vehicleState.id,
              timestamp: pt.timestamp,
              latitude: pt.latitude,
              longitude: pt.longitude,
              accuracy: pt.accuracy,
              speed: pt.speed,
              heading: pt.heading,
              receivedAt: now,
            });
          }

          if (gpsHistory.length > 500) gpsHistory.length = 500;

          recentEvents.unshift({
            id: `evt-${now}`,
            vehicle_id: vehicleState.id,
            event_type: 'OFFLINE_SYNC',
            timestamp: now,
            metadata: JSON.stringify({ syncedCount: points.length }),
          });

          vehicleState.status = 'LIVE';

          return sendJson({
            success: true,
            data: { syncedCount: points.length, totalReceived: points.length, receivedAt: now },
            error: null,
          });
        }

        // 5. Routes
        if (path === '/api/routes' && method === 'POST') {
          const body = await getBody();
          const coords: [number, number][] = [
            [body.origin.lng, body.origin.lat],
          ];
          if (body.waypoints) {
            for (const wp of body.waypoints) coords.push([wp.lng, wp.lat]);
          }
          coords.push([body.destination.lng, body.destination.lat]);

          let routeGeojson: any = null;
          let distanceMeters = 2500;
          let durationSeconds = 480;

          // Call OSRM
          try {
            const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
            const osrmRes = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
            );
            const data = await osrmRes.json() as any;
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
              routeGeojson = data.routes[0].geometry;
              distanceMeters = data.routes[0].distance;
              durationSeconds = data.routes[0].duration;
            }
          } catch {
            routeGeojson = { type: 'LineString', coordinates: coords };
          }

          activeRoute = {
            id: `route-${Date.now()}`,
            name: body.name || 'Assigned Logistics Corridor',
            vehicle_id: body.vehicleId || vehicleState.id,
            origin_lat: body.origin.lat,
            origin_lng: body.origin.lng,
            destination_lat: body.destination.lat,
            destination_lng: body.destination.lng,
            waypoints: coords,
            route_geojson: routeGeojson,
            distance_meters: Math.round(distanceMeters),
            estimated_duration_seconds: Math.round(durationSeconds),
            is_active: 1,
            created_at: new Date().toISOString(),
          };

          recentEvents.unshift({
            id: `evt-${Date.now()}`,
            vehicle_id: vehicleState.id,
            route_id: activeRoute.id,
            event_type: 'ROUTE_ASSIGNED',
            timestamp: Date.now(),
            metadata: JSON.stringify({ name: activeRoute.name, distance: distanceMeters }),
          });

          return sendJson({ success: true, data: activeRoute, error: null });
        }

        // Recalculate
        const recalcMatch = path.match(/^\/api\/routes\/([^/]+)\/recalculate$/);
        if (recalcMatch && method === 'POST') {
          const body = await getBody();
          if (!activeRoute) {
            return sendJson({ success: false, data: null, error: { code: 'NO_ROUTE', message: 'No active route' } }, 404);
          }

          try {
            const coords = `${body.currentLng},${body.currentLat};${activeRoute.destination_lng},${activeRoute.destination_lat}`;
            const osrmRes = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
            );
            const data = await osrmRes.json() as any;
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
              const route = data.routes[0];
              const distDelta = route.distance - activeRoute.distance_meters;
              const durDelta = route.duration - activeRoute.estimated_duration_seconds;

              recentEvents.unshift({
                id: `evt-${Date.now()}`,
                vehicle_id: vehicleState.id,
                route_id: activeRoute.id,
                event_type: 'ALTERNATE_ROUTE_CALCULATED',
                timestamp: Date.now(),
                metadata: JSON.stringify({ alternateDistance: route.distance, distanceDelta: distDelta }),
              });

              return sendJson({
                success: true,
                data: {
                  routeId: activeRoute.id,
                  alternateRouteGeoJson: route.geometry,
                  alternateDistanceMeters: route.distance,
                  alternateDurationSeconds: route.duration,
                  originalDistanceMeters: activeRoute.distance_meters,
                  originalDurationSeconds: activeRoute.estimated_duration_seconds,
                  distanceDeltaMeters: distDelta,
                  durationDeltaSeconds: durDelta,
                },
                error: null,
              });
            }
          } catch {
            return sendJson({
              success: false,
              data: null,
              error: { code: 'ALTERNATE_UNAVAILABLE', message: 'Alternate route unavailable' },
            }, 503);
          }
        }

        // 6. Consolidated Dashboard State
        if (path === '/api/dashboard/state' && method === 'GET') {
          const now = Date.now();
          const latest = gpsHistory[0] || null;

          let calculatedStatus = vehicleState.status;
          if (latest) {
            const ageSec = (now - latest.timestamp) / 1000;
            if (ageSec > 90) calculatedStatus = 'STALE';
            else if (ageSec > 30) calculatedStatus = 'DELAYED';
            else calculatedStatus = 'LIVE';
          }

          return sendJson({
            success: true,
            data: {
              vehicle: {
                ...vehicleState,
                status: calculatedStatus,
              },
              latestGps: latest,
              activeRoute,
              recentEvents: recentEvents.slice(0, 20),
              serverTime: now,
              thresholds: {
                delayedAfterSeconds: 30,
                staleAfterSeconds: 90,
              },
            },
            error: null,
          });
        }

        return next();
      });
    },
  };
}

