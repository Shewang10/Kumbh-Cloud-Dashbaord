// Application Configuration and Constants

export const CONFIG = {
  VEHICLE_ID: import.meta.env.VITE_VEHICLE_ID || 'CF-BIKE-001',
  TRACK_INTERVAL_MS: Number(import.meta.env.VITE_TRACK_INTERVAL_MS || 3000),
  DASHBOARD_POLL_INTERVAL_MS: Number(import.meta.env.VITE_DASHBOARD_POLL_INTERVAL_MS || 3000),
  ROUTE_DEVIATION_THRESHOLD_METERS: Number(import.meta.env.VITE_ROUTE_DEVIATION_THRESHOLD_METERS || 75),
  STALE_AFTER_SECONDS: Number(import.meta.env.VITE_STALE_AFTER_SECONDS || 90),
  DELAYED_AFTER_SECONDS: Number(import.meta.env.VITE_DELAYED_AFTER_SECONDS || 30),
  TRACKER_TOKEN: import.meta.env.VITE_TRACKER_TOKEN || 'cleanfleet-tracker-token',
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
  // Free OpenFreeMap 3D Vector Style
  MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',
  // Free OSRM Routing Service Endpoint
  OSRM_ROUTING_URL: 'https://router.project-osrm.org/route/v1/driving',
  // Default coordinates (e.g., San Francisco center / initial view)
  DEFAULT_CENTER: [-122.4194, 37.7749] as [number, number],
  DEFAULT_ZOOM: 15,
  DEFAULT_PITCH: 50,
  DEFAULT_BEARING: -15,
};

