import { CONFIG } from '../config';
import { ApiResponse, DashboardState, GpsPoint, RouteData } from '../types';

const BASE_URL = CONFIG.API_BASE_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach tracker bearer token if present
  if (CONFIG.TRACKER_TOKEN && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${CONFIG.TRACKER_TOKEN}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || `API request failed with status ${response.status}`);
  }

  return data.data as T;
}

export const api = {
  async health(): Promise<{ status: string; database: string; time: number }> {
    return request('/api/health', { method: 'GET' });
  },

  async startTracker(vehicleId = CONFIG.VEHICLE_ID): Promise<{ vehicleId: string; status: string }> {
    return request('/api/tracker/start', {
      method: 'POST',
      body: JSON.stringify({ vehicleId }),
    });
  },

  async stopTracker(vehicleId = CONFIG.VEHICLE_ID): Promise<{ vehicleId: string; status: string }> {
    return request('/api/tracker/stop', {
      method: 'POST',
      body: JSON.stringify({ vehicleId }),
    });
  },

  async sendGpsPoint(point: GpsPoint): Promise<{ id: string; vehicleId: string; receivedAt: number }> {
    return request('/api/gps', {
      method: 'POST',
      body: JSON.stringify(point),
    });
  },

  async sendGpsBatch(points: GpsPoint[]): Promise<{ syncedCount: number; totalReceived: number }> {
    return request('/api/gps/batch', {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  },

  async getDashboardState(vehicleId = CONFIG.VEHICLE_ID): Promise<DashboardState> {
    return request(`/api/dashboard/state?vehicleId=${encodeURIComponent(vehicleId)}`, {
      method: 'GET',
    });
  },

  async createRoute(payload: {
    vehicleId: string;
    name: string;
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    waypoints?: { lat: number; lng: number }[];
  }): Promise<RouteData> {
    return request('/api/routes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async recalculateRoute(
    routeId: string,
    currentLat: number,
    currentLng: number
  ): Promise<{
    routeId: string;
    alternateRouteGeoJson: any;
    alternateDistanceMeters: number;
    alternateDurationSeconds: number;
    originalDistanceMeters: number;
    originalDurationSeconds: number;
    distanceDeltaMeters: number;
    durationDeltaSeconds: number;
  }> {
    return request(`/api/routes/${encodeURIComponent(routeId)}/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ currentLat, currentLng }),
    });
  },
};

