// CleanFleet Core Type Definitions

export type VehicleStatus = 'LIVE' | 'DELAYED' | 'STALE' | 'OFFLINE' | 'DEVIATION' | 'IDLE';

export interface Vehicle {
  id: string;
  vehicle_code: string;
  vehicle_type: string;
  name: string;
  status: VehicleStatus;
  created_at?: string;
  updated_at?: string;
}

export interface GpsPoint {
  id: string;
  vehicleId: string;
  timestamp: number; // epoch ms
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null; // in m/s from browser, converted to km/h in telemetry
  heading: number | null; // degrees from north 0-360
  receivedAt?: number;
}

export interface RouteData {
  id: string;
  name: string;
  vehicle_id: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  waypoints: [number, number][]; // [lng, lat]
  route_geojson: GeoJSON.LineString | GeoJSON.Feature<GeoJSON.LineString>;
  distance_meters: number;
  estimated_duration_seconds: number;
  is_active: number;
  created_at?: string;
}

export type EventSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface RouteEvent {
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

export interface DashboardState {
  vehicle: Vehicle;
  latestGps: GpsPoint | null;
  activeRoute: RouteData | null;
  recentEvents: RouteEvent[];
  serverTime: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

