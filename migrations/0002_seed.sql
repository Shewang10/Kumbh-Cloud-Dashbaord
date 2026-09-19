-- CleanFleet Seed Data: 0002_seed.sql

INSERT OR IGNORE INTO vehicles (id, vehicle_code, vehicle_type, name, status, created_at, updated_at)
VALUES (
  'CF-BIKE-001',
  'CF-BIKE-001',
  'BIKE',
  'CleanFleet Test Bike',
  'IDLE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

