# CleanFleet Command Center — 3D Live Vehicle Tracking & Route Compliance POC

**CleanFleet Command Center** is a zero-cost, production-quality proof of concept for real-time single-bike fleet tracking and route corridor compliance monitoring. It connects a real iPhone running as a mobile GPS tracker to a futuristic 3D desktop fleet command center on Mac, backed by a Cloudflare Workers and D1 database edge infrastructure.

---

## 1. Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────┐
 │               iPhone (Mobile Web Browser)                   │
 │  • navigator.geolocation.watchPosition() (Real GPS)         │
 │  • High-accuracy, speed (km/h), heading, and diagnostics    │
 │  • IndexedDB Offline Queue (Zero data loss if connection drops)│
 └──────────────────────────────┬──────────────────────────────┘
                                │ HTTPS / Bearer Token
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  Cloudflare Workers (Edge API)              │
 │  • /api/gps (Single ingestion) & /api/gps/batch (Offline sync)│
 │  • /api/dashboard/state (Single-query consolidated telemetry)│
 │  • /api/routes & /api/routes/:id/recalculate (OSRM Gateway) │
 │  • Static Assets fetcher (Serves React SPA on same origin)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │ SQL
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  Cloudflare D1 Database (SQLite)            │
 │  • vehicles (CF-BIKE-001)                                   │
 │  • gps_points (Historical breadcrumbs & latest coordinates) │
 │  • routes (Assigned A→B→C corridors & geometry)             │
 │  • route_events (Deviation, compliance & sync audit trail)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Polling (3s interval)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                 Mac Command Center Dashboard                │
 │  • 3D MapLibre GL JS + OpenFreeMap 3D Building Extrusions   │
 │  • Dynamic Vehicle Marker (Rotating heading + pulsing glow) │
 │  • Turf.js Corridor Engine (75m threshold + 2-pt hysteresis)│
 │  • Telemetry HUD (Speedometer, ETA, Distance, Progress %)   │
 │  • Real-time Audit Timeline & Operational Alert Center      │
 └─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS
- **Map & 3D Visualization**: MapLibre GL JS, OpenFreeMap Liberty 3D Vector Style, 3D Building Extrusions
- **Geospatial Computations**: Turf.js (`pointToLineDistance`, `nearestPointOnLine`, `lineSlice`, `length`, `buffer`)
- **Offline Storage**: IndexedDB (via `idb`)
- **Backend**: Cloudflare Workers (TypeScript, `nodejs_compat`), REST API
- **Database**: Cloudflare D1 (SQLite edge database)
- **Routing**: Open Source Routing Machine (OSRM) free public API
- **Iconography**: Lucide React
- **Automated Testing**: Vitest, Fake-IndexedDB
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`)

---

## 3. Core Features & Compliance Rules

1. **Real GPS, No Mock Simulation**: Uses native `navigator.geolocation.watchPosition` with high accuracy mode on iPhone.
2. **Offline Resilience**: When network is lost, GPS points are stored persistently in **IndexedDB**. When connection returns, points are synchronized automatically in batches to `/api/gps/batch`.
3. **Route Compliance & Hysteresis**:
   - Compares vehicle position to the assigned route corridor using Turf.js.
   - Configurable threshold: `ROUTE_DEVIATION_THRESHOLD_METERS = 75`.
   - **Hysteresis Confirmation Window**: To prevent false alarms caused by consumer phone GPS jitter, a single noisy point outside the corridor does not trigger an alert; 2 consecutive points outside the corridor trigger `ROUTE_DEVIATION`. Returning inside clears the alert immediately.
4. **Alternate Route Recalculation**:
   - When deviation occurs, operators can click **CALCULATE ALTERNATE ROUTE** to query OSRM from the vehicle's current position to destination waypoint C, showing distance and ETA delta.
   - If routing is unreachable, displays `"Alternate route unavailable"` without fabricating data.
5. **Tracker Stopped & Stale Detection**:
   - `LIVE`: Last GPS update `< 30s` ago.
   - `DELAYED`: Last GPS update `30s – 90s` ago.
   - `STALE`: No GPS update for `> 90s` (or tracker explicitly stopped).
6. **Dynamic ETA Calculation**:
   - Derived from remaining route distance and vehicle speed.
   - If stationary: displays `ETA PAUSED`.
   - If stale or offline: displays `ETA UNAVAILABLE`.
   - When within 30m of destination: displays `ARRIVED`.

---

## 4. Local Development

You can run the entire system locally without needing Cloudflare credentials or external setup:

```bash
# 1. Clone repository & install dependencies
npm install

# 2. Run automated test suite
npm test

# 3. Start local development server (with built-in local API engine)
npm run dev
```

Vite will start at:
- **Mac Dashboard**: `http://localhost:5173/dashboard`
- **iPhone Tracker**: `http://localhost:5173/tracker` (or access via your local Wi-Fi IP shown in the terminal, e.g. `http://192.168.x.x:5173/tracker`)
- **API Health**: `http://localhost:5173/api/health`

---

## 5. Cloudflare Database & Edge Setup

### Prerequisites
- Free Cloudflare account ([dash.cloudflare.com](https://dash.cloudflare.com))
- Wrangler CLI installed (`npm install -g wrangler` or run via `npx wrangler`)

### Step 1: Login to Cloudflare
```bash
npx wrangler login
```

### Step 2: Create D1 Database
```bash
npx wrangler d1 create cleanfleet-d1
```
*Copy the `database_id` output and paste it into `wrangler.toml`:*
```toml
[[d1_databases]]
binding = "DB"
database_name = "cleanfleet-d1"
database_id = "YOUR_ACTUAL_D1_DATABASE_ID"
```

### Step 3: Apply Migrations
```bash
# Apply schema and initial seed to remote Cloudflare D1
npx wrangler d1 migrations apply cleanfleet-d1 --remote
```

### Step 4: Configure Secrets (Optional but Recommended)
```bash
npx wrangler secret put TRACKER_SECRET
# Enter your desired bearer token: cleanfleet-tracker-secret-token
```

### Step 5: Build and Deploy to Cloudflare Free Tier
```bash
npm run worker:deploy
```
Wrangler will output your live URL:
```
https://cleanfleet-command-center.<your-subdomain>.workers.dev
```

---

## 6. GitHub Actions CI/CD Deployment

The repository includes `.github/workflows/deploy.yml` which runs tests, builds the Vite frontend, applies D1 migrations, and deploys to Cloudflare Workers on every push to `main`.

### Required GitHub Secrets
In your GitHub repository, go to **Settings** → **Secrets and variables** → **Actions** and add:
1. `CLOUDFLARE_API_TOKEN`: Create a Cloudflare API Token with `Workers Scripts: Edit`, `D1: Edit`, and `Account Settings: Read` permissions.
2. `CLOUDFLARE_ACCOUNT_ID`: Found on your Cloudflare dashboard overview page.

---

## 7. Environment Variables (`.env.example`)

| Variable | Default | Description |
|---|---|---|
| `VITE_VEHICLE_ID` | `CF-BIKE-001` | Vehicle identifier to track |
| `VITE_TRACK_INTERVAL_MS` | `3000` | Real GPS sample transmission rate (ms) |
| `VITE_DASHBOARD_POLL_INTERVAL_MS` | `3000` | Command center polling interval (ms) |
| `VITE_ROUTE_DEVIATION_THRESHOLD_METERS`| `75` | Route corridor width tolerance in meters |
| `VITE_STALE_AFTER_SECONDS` | `90` | Seconds before vehicle is marked STALE |
| `VITE_DELAYED_AFTER_SECONDS` | `30` | Seconds before vehicle is marked DELAYED |
| `VITE_TRACKER_TOKEN` | `cleanfleet-tracker-secret-token` | Bearer token for authorized GPS ingestion |
| `VITE_API_BASE_URL` | `""` | Base API URL (empty for same-origin Workers deployment) |

---

## 8. Real-World A→B→C Verification Procedure

### Step 1: Open iPhone Tracker
1. On your iPhone Safari browser, open:
   `https://<your-project>.workers.dev/tracker`
2. Tap **Allow** when prompted for Location access ("While Using the App").
3. Tap **START TRACKING**.
4. Confirm the status badge transitions to:
   `GPS ACTIVE — Real-time GPS transmitting`
5. Note your current speed, accuracy, and heading.

### Step 2: Open Mac Command Center
1. On your Mac, open:
   `https://<your-project>.workers.dev/dashboard`
2. Confirm the top header displays:
   - `GPS ● LIVE`
   - `TRACKER ● ONLINE`
   - `API ● ONLINE`
   - `DATABASE ● ONLINE`
3. Notice the 3D angled MapLibre map with 3D buildings and the animated vehicle marker positioned at your real iPhone GPS coordinates.

### Step 3: Create & Assign Route
1. Click **ASSIGN ROUTE** on the Mac dashboard.
2. Under **Point A (Origin)**, click **USE VEHICLE GPS** (or click the map).
3. Under **Point B (Waypoint)**, click **SELECT ON MAP** and click a turn on the map.
4. Under **Point C (Destination)**, click **SELECT ON MAP** and click the final destination.
5. Click **CALCULATE ROUTE**. The preview will show estimated distance (km) and duration (min).
6. Click **ASSIGN ROUTE**.
7. Confirm the route line illuminates in electric blue with an active 75m glowing corridor buffer and A/B/C markers.

### Step 4: Live Ride & Progress Tracking
1. Begin riding the bike along the corridor.
2. The Mac dashboard will track the bike live:
   - Speedometer updates every 3–5 seconds with actual speed.
   - Route progress percentage bar fills incrementally.
   - Projected ETA updates dynamically.
   - Vehicle heading rotates in the direction of travel.

### Step 5: Test Offline Resilience (IndexedDB Queue)
1. While moving, switch the iPhone to Airplane Mode (or disable Cellular/Wi-Fi).
2. The tracker card immediately turns amber:
   `OFFLINE — LOCAL QUEUE (X points saved locally)`
3. Continue riding for 30–60 seconds. Observe the offline queue counter incrementing (`5 points`, `10 points`...).
4. Restore internet connectivity.
5. The tracker detects network recovery:
   `BACK ONLINE — SYNCING X QUEUED POINTS`
6. Once synchronized, the queue returns to `0 points`, and the Mac command center timeline logs:
   `Synchronized X offline GPS points`.

### Step 6: Test Route Deviation & Alternate Route
1. Intentionally make a turn off the assigned A→B→C route corridor.
2. The 1st GPS point outside the 75m corridor is noted but does not trigger an alarm (hysteresis filter).
3. Upon the 2nd consecutive outside point, the dashboard triggers:
   - Vehicle status changes to `⚠ DEVIATION` (pulsing red glow).
   - Banner: `⚠ ROUTE DEVIATION DETECTED — 112m FROM ASSIGNED ROUTE`.
   - Timeline records: `Route deviation detected`.
4. Click **CALCULATE ALTERNATE ROUTE**.
5. An alternate OSRM route is generated from the bike's current location to Point C, showing distance and ETA delta.

### Step 7: Test Tracker Stop & Stale Detection
1. On iPhone, tap **STOP TRACKING**.
2. On Mac dashboard:
   - At 30s: vehicle status transitions to `DELAYED` (amber).
   - At 90s: vehicle status transitions to `STALE` (grey), and ETA changes to `ETA UNAVAILABLE`.

---

## 9. Troubleshooting Guide

- **GPS Permission Denied on iOS**:
  Tap the `aA` icon in the Safari address bar → **Website Settings** → **Location** → Set to **Allow**. Ensure iOS Settings → Privacy & Security → Location Services → Safari Websites is set to "While Using".
- **HTTPS Required for Geolocation**:
  Browsers only provide high-accuracy GPS over secure contexts (`https://` or `localhost`). When testing with an iPhone on local Wi-Fi, deploy to your Cloudflare Worker URL (`https://*.workers.dev`) or use an HTTPS tunnel.
- **Map Tiles Not Loading**:
  CleanFleet uses OpenFreeMap Liberty tiles (`https://tiles.openfreemap.org/styles/liberty`), which require no API key. Ensure outbound network access to `tiles.openfreemap.org` is permitted.
- **Routing Unavailable**:
  If the public OSRM demo is temporarily rate-limited, the system falls back to a straight-line corridor and shows `"Alternate route unavailable"` when recalculating.
- **D1 Database Errors**:
  Verify migrations have been applied with `npx wrangler d1 migrations apply cleanfleet-d1 --remote` and confirm your database binding in `wrangler.toml` matches your database name.

---

## 10. Multi-Vehicle Extension Path

CleanFleet was built with clean separation to scale to multiple vehicles:
1. **Schema**: The `vehicles` table supports arbitrary vehicle records (`CF-BIKE-002`, `CF-VAN-001`), and `gps_points`, `routes`, and `route_events` use foreign keys on `vehicle_id`.
2. **Dashboard**: The state API `/api/dashboard/state?vehicleId=...` can be extended with a `/api/vehicles` endpoint to support vehicle selection or multi-vehicle map markers.
3. **Tracker**: The tracker allows setting `VITE_VEHICLE_ID` or choosing a vehicle ID from a driver login prompt.

