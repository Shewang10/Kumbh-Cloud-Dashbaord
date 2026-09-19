-- CleanFleet D1 Schema: 0001_init.sql

-- 1. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  vehicle_code TEXT UNIQUE NOT NULL,
  vehicle_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'IDLE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. GPS Points
CREATE TABLE IF NOT EXISTS gps_points (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gps_points_vehicle_time ON gps_points (vehicle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gps_points_received ON gps_points (received_at DESC);

-- 3. Assigned Routes
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  waypoints_json TEXT,
  route_geojson TEXT NOT NULL,
  distance_meters REAL NOT NULL,
  estimated_duration_seconds REAL NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_routes_vehicle_active ON routes (vehicle_id, is_active);

-- 4. Route Events (Audit / Compliance log)
CREATE TABLE IF NOT EXISTS route_events (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  route_id TEXT,
  event_type TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  distance_from_route REAL,
  timestamp INTEGER NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_route_events_vehicle ON route_events (vehicle_id, timestamp DESC);

