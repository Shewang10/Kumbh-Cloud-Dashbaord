import { Env } from './types';
import {
  handleGpsPoint,
  handleGpsBatch,
  handleGetLatestGps,
  handleGetHistory,
  handleTrackerStart,
  handleTrackerStop,
  errorResponse,
  successResponse,
} from './api/gps';
import {
  handleCreateRoute,
  handleGetActiveRoute,
  handleRecalculateRoute,
} from './api/routes';
import { handleDashboardState } from './api/dashboard';

function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function verifyAuth(request: Request, env: Env): boolean {
  // If no TRACKER_SECRET is configured, allow in development/open mode
  if (!env.TRACKER_SECRET) {
    return true;
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7).trim();
  return token === env.TRACKER_SECRET;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    // API Router
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.replace(/\/$/, '');

      // Health Check
      if (path === '/api/health' && method === 'GET') {
        let dbOk = false;
        try {
          const res = await env.DB.prepare('SELECT 1 as ok').first();
          dbOk = res?.ok === 1;
        } catch {
          dbOk = false;
        }

        return successResponse({
          status: 'healthy',
          database: dbOk ? 'ONLINE' : 'OFFLINE',
          version: '1.0.0',
          time: Date.now(),
        });
      }

      // Tracker Start / Stop
      if (path === '/api/tracker/start' && method === 'POST') {
        return handleTrackerStart(request, env);
      }
      if (path === '/api/tracker/stop' && method === 'POST') {
        return handleTrackerStop(request, env);
      }

      // GPS ingestion endpoints (Protected by Bearer token if configured)
      if (path === '/api/gps' && method === 'POST') {
        if (!verifyAuth(request, env)) {
          return errorResponse('UNAUTHORIZED', 'Invalid or missing tracker token', 401);
        }
        return handleGpsPoint(request, env);
      }

      if (path === '/api/gps/batch' && method === 'POST') {
        if (!verifyAuth(request, env)) {
          return errorResponse('UNAUTHORIZED', 'Invalid or missing tracker token', 401);
        }
        return handleGpsBatch(request, env);
      }

      // Latest & History GPS
      const vehicleLatestMatch = path.match(/^\/api\/vehicle\/([^/]+)\/latest$/);
      if (vehicleLatestMatch && method === 'GET') {
        return handleGetLatestGps(vehicleLatestMatch[1], env);
      }

      const vehicleHistoryMatch = path.match(/^\/api\/vehicle\/([^/]+)\/history$/);
      if (vehicleHistoryMatch && method === 'GET') {
        return handleGetHistory(vehicleHistoryMatch[1], env);
      }

      // Routes API
      if (path === '/api/routes' && method === 'POST') {
        return handleCreateRoute(request, env);
      }

      const routeActiveMatch = path.match(/^\/api\/routes\/active\/([^/]+)$/);
      if (routeActiveMatch && method === 'GET') {
        return handleGetActiveRoute(routeActiveMatch[1], env);
      }

      const routeRecalcMatch = path.match(/^\/api\/routes\/([^/]+)\/recalculate$/);
      if (routeRecalcMatch && method === 'POST') {
        return handleRecalculateRoute(routeRecalcMatch[1], request, env);
      }

      // Consolidated Dashboard State
      if (path === '/api/dashboard/state' && method === 'GET') {
        return handleDashboardState(request, env);
      }

      return errorResponse('NOT_FOUND', `API endpoint ${method} ${path} not found`, 404);
    }

    // Static Assets from Worker (SPA)
    if (env.ASSETS) {
      try {
        const response = await env.ASSETS.fetch(request);
        if (response.status !== 404) {
          return response;
        }
        // Fallback for SPA routing (/tracker, /dashboard)
        const spaRequest = new Request(new URL('/', request.url).toString(), request);
        return await env.ASSETS.fetch(spaRequest);
      } catch (err: any) {
        return new Response('Cloud Command Center Frontend is deploying...', { status: 503 });
      }
    }

    return new Response('Cloud Command Center API Edge', { status: 200 });
  },
};

