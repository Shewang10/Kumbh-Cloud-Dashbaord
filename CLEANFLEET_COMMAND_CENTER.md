# CLEANFLEET COMMAND CENTER
## 3D Live Vehicle Tracking & Route Compliance POC — Complete System Manual & Report

---

## 1. Executive Summary

**CleanFleet Command Center** is a zero-cost, production-quality proof of concept (POC) for live single-bike fleet operations, 3D geospatial tracking, and route corridor compliance monitoring.

The system connects:
1. **iPhone Mobile Web GPS Tracker (`/tracker`)**: Transmits high-accuracy real GPS coordinates, speed (km/h), heading, accuracy, and operational diagnostics. Unsent coordinates are queued locally in **IndexedDB** during offline periods and synchronized automatically upon reconnection.
2. **Mac Fleet Command Center (`/dashboard`)**: A futuristic dark-mode operations HUD powered by **MapLibre GL JS** and **OpenFreeMap 3D Vector Tiles**, featuring 3D building extrusions, dynamic vehicle markers with heading orientation and glowing status rings, A→B→C route corridor visualization, operational alert center, and real-time audit event timeline.
3. **Cloudflare Edge Infrastructure (`/api/*`)**: A lightweight REST API built on **Cloudflare Workers** backed by **Cloudflare D1** (SQLite at the edge) and an **OSRM** gateway for routing geometry and alternate route recalculations.

---

## 2. End-to-End System Architecture

```
                                  ┌───────────────────────────┐
                                  │   iPhone (Mobile Web)     │
                                  │   • High-Accuracy GPS     │
                                  │   • Speed, Heading, Stats │
                                  └─────────────┬─────────────┘
                                                │
                                    Network Lost?
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                                   [NO]                   [YES]
                                    │                       │
                                    │             [IndexedDB Queue]
                                    │             (Persistent local storage)
                                    │                       │
                                    │                 Network Restored?
                                    │                       │
                                    │                       ▼
                                    │              [Batch Auto-Sync]
                                    │                       │
                                    ▼                       ▼
                           HTTPS / Bearer Token: cleanfleet-tracker-secret-token
                                                │
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │       Cloudflare Worker REST API             │
                         │  • /api/gps (Single ingestion)               │
                         │  • /api/gps/batch (Offline batch sync)       │
                         │  • /api/dashboard/state (Telemetry poller)   │
                         │  • /api/routes (OSRM Route Gateway)          │
                         │  • /api/routes/:id/recalculate (OSRM Alt)    │
                         │  • Static SPA Assets (Workers Assets)        │
                         └──────────────────────┬───────────────────────┘
                                                │
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │       Cloudflare D1 Edge Database            │
                         │  • vehicles (CF-BIKE-001)                    │
                         │  • gps_points (Historical & latest coords)   │
                         │  • routes (A→B→C corridors & geometry)       │
                         │  • route_events (Compliance & sync audit)    │
                         └──────────────────────┬───────────────────────┘
                                                │
                                                ▼ (3-second polling)
                         ┌──────────────────────────────────────────────┐
                         │        Mac Fleet Command Center              │
                         │  • Fullscreen 3D MapLibre Canvas             │
                         │  • OpenFreeMap 3D Building Extrusions        │
                         │  • Turf.js Route Corridor Engine (75m)       │
                         │  • 2-Point Jitter Hysteresis Confirmation    │
                         │  • Telemetry HUD (Speed, ETA, Distance)      │
                         │  • Real-Time Operational Alert Center        │
                         │  • Live Audit Event Timeline                 │
                         └──────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technologies | Purpose | Zero-Cost Guarantee |
|---|---|---|---|
| **Mobile Tracker** | React 19, TypeScript, IndexedDB (`idb`), Geolocation API | High-accuracy iPhone GPS tracking & offline persistence | 100% Native & Free |
| **Command Center** | React 19, Tailwind CSS, Lucide React, Vite 6 | Desktop 3D Operations Dashboard HUD | Open Source |
| **3D Map Engine** | MapLibre GL JS | 3D pitched vector map, camera follow, marker animations | Open Source (BSD-3) |
| **Map Vector Tiles** | OpenFreeMap Liberty Style | 3D building extrusions, streets, landmarks | 100% Free & Open |
| **Geospatial Engine**| Turf.js | Orthogonal distance, line slicing, buffer corridors, ETA | Open Source (MIT) |
| **Edge API** | Cloudflare Workers (TypeScript) | Serverless REST API serving frontend and API from same origin | Cloudflare Free Tier |
| **Database** | Cloudflare D1 (Distributed SQLite) | Vehicles, GPS breadcrumbs, routes, event logs | Cloudflare Free Tier |
| **Routing Gateway** | OSRM (Open Source Routing Machine) | Route geometry generation & alternate bypass recalculation | Free Public API |
| **Automated Testing**| Vitest, Fake-IndexedDB | Unit tests for GPS, queue, compliance, and ETA | Open Source (MIT) |
| **CI/CD** | GitHub Actions | Automated build, test, and Cloudflare deployment | Free for Public/Private repos |

---

## 4. Repository Structure

```
cleanfleet-command-center/
├── src/
│   ├── api/
│   │   └── client.ts                    # Type-safe API client with Bearer token authentication
│   ├── components/
│   │   ├── AlertCenter.tsx              # Operational alerts HUD (CRITICAL, WARNING, SUCCESS, INFO)
│   │   ├── RouteModal.tsx               # Step-by-step interactive A→B→C route corridor creator
│   │   └── Timeline.tsx                 # Live event audit trail stream from D1 database
│   ├── gps/
│   │   └── trackerService.ts            # Native watchPosition GPS service, diagnostics, sync loop
│   ├── map/
│   │   └── MapLibre3D.tsx               # 3D MapLibre map, building extrusions, animated bike marker
│   ├── offline/
│   │   └── idbQueue.ts                  # Persistent IndexedDB FIFO queue for offline GPS points
│   ├── pages/
│   │   ├── DashboardPage.tsx            # Desktop-first Mac Command Center page
│   │   └── TrackerPage.tsx              # Mobile-first iPhone GPS Tracker page
│   ├── services/
│   │   └── complianceEngine.ts          # Turf.js route deviation, hysteresis filter, progress, ETA
│   ├── types/
│   │   └── index.ts                     # Shared TypeScript interfaces & types
│   ├── App.tsx                          # Path-based routing (/tracker, /dashboard) & switcher
│   ├── config.ts                        # Central application constants & default thresholds
│   ├── index.css                        # Cyberpunk/command-center theme styles & scrollbars
│   └── main.tsx                         # React 19 application entrypoint
├── worker/
│   ├── api/
│   │   ├── dashboard.ts                 # /api/dashboard/state single-query telemetry aggregator
│   │   ├── gps.ts                       # /api/gps, /api/gps/batch, latest, history, start, stop
│   │   └── routes.ts                    # /api/routes, active route, OSRM recalculation gateway
│   ├── index.ts                         # Cloudflare Worker router, CORS, auth, and static assets
│   └── types.ts                         # Worker environment bindings & database interfaces
├── migrations/
│   ├── 0001_init.sql                    # D1 schema: vehicles, gps_points, routes, route_events
│   └── 0002_seed.sql                    # Initial demo vehicle seed: CF-BIKE-001
├── tests/
│   ├── compliance.test.ts               # Route deviation, 75m corridor, and 2-point hysteresis tests
│   ├── eta.test.ts                      # Moving, paused, stale, and arrived ETA calculation tests
│   ├── gps.test.ts                      # Coordinate boundary, validation, and status age tests
│   └── offlineQueue.test.ts             # IndexedDB queue persistence, batch purge, and retry tests
├── .github/workflows/
│   └── deploy.yml                       # GitHub Actions automated test, build, and deploy workflow
├── vite-plugin-local-api.ts             # Zero-setup local development API engine
├── wrangler.toml                        # Cloudflare Workers, D1 database & static assets config
├── .env.example                         # Documented environment variables template
├── .env                                 # Local development environment configuration
├── package.json                         # Project dependencies and operational scripts
├── tsconfig.json                        # TypeScript configuration
├── vite.config.ts                       # Vite bundler configuration with mobile network exposure
├── README.md                            # Complete setup and test guide
└── CLEANFLEET_COMMAND_CENTER.md         # Full project report and operational manual
```

---

## 5. Core Operational Logic & Rules

### A. Offline Resilience & Zero Data Loss
- Unsent GPS points are written directly to IndexedDB (`cleanfleet_offline_db` / `gps_queue`).
- In-memory arrays are not used as the primary storage; unsent coordinates survive browser refresh or mobile Safari app switching.
- On network recovery, the system uploads points in batches of up to 100 via `POST /api/gps/batch`.
- Successfully saved points are removed from IndexedDB; points that fail to upload remain in the queue with exponential retry backoff.
- A manual **SYNC NOW** button allows immediate user-triggered synchronization.

### B. Route Deviation Detection & Hysteresis Confirmation
- **Corridor Threshold**: `ROUTE_DEVIATION_THRESHOLD_METERS = 75`.
- **Hysteresis Confirmation Window**: Consumer smartphones can experience temporary GPS multipath bounce or accuracy jitter. CleanFleet requires **2 consecutive points** outside the 75m corridor before triggering a `ROUTE_DEVIATION` alert.
- When outside:
  - Vehicle status turns to `⚠ DEVIATION`.
  - Vehicle marker flashes with a red glowing ring.
  - An alert banner displays: `⚠ ROUTE DEVIATION DETECTED — [X]m FROM ASSIGNED ROUTE`.
  - The **CALCULATE ALTERNATE ROUTE** button activates.
- When the vehicle returns within 75m of the corridor, the counter resets and the status immediately reverts to `ROUTE COMPLIANT`.

### C. Alternate Route Recalculation
- Clicking **CALCULATE ALTERNATE ROUTE** queries OSRM from the bike's current location to Point C.
- Displays delta distance (km) and delta duration (minutes).
- If OSRM is unreachable, displays `"Alternate route unavailable"` without fabricating data.

### D. Vehicle Status & Stale Detection
- `LIVE`: GPS point timestamp `< 30s` old.
- `DELAYED`: GPS point timestamp between `30s` and `90s` old.
- `STALE`: No GPS update for `> 90s` (or tracker broadcast stopped).
- Distinguishes between GPS stopped, tracker stopped, phone offline, and API delay using both the client GPS timestamp and the server `received_at` timestamp.

### E. Dynamic ETA Projections
- Derived from remaining route distance and vehicle speed.
- If stationary (< 1.5 km/h): displays `[X] min (PAUSED)`.
- If stale or offline: displays `ETA UNAVAILABLE`.
- When within 30m of Point C: displays `ARRIVED`.

---

## 6. Local Development Guide

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Automated Test Suite
```bash
npm test
```
*Runs all 18 unit tests across GPS, Compliance, ETA, and Offline Queue modules.*

### Step 3: Start Local Full-Stack Development
```bash
npm run dev
```
*Vite starts with the built-in local development API engine (`vite-plugin-local-api.ts`), exposing:*
- **Mac Dashboard**: `http://localhost:5173/dashboard`
- **iPhone Tracker**: `http://localhost:5173/tracker` (or via your local network IP: `http://192.168.x.x:5173/tracker`)
- **API Health Check**: `http://localhost:5173/api/health`

---

## 7. Cloudflare D1 & Edge Deployment Guide

### Prerequisites
- Free Cloudflare account ([dash.cloudflare.com](https://dash.cloudflare.com))
- Node.js & Wrangler CLI

### Step 1: Login to Cloudflare
```bash
npx wrangler login
```

### Step 2: Create D1 Database
```bash
npx wrangler d1 create cleanfleet-d1
```
*Note the returned `database_id` and update `wrangler.toml`:*
```toml
[[d1_databases]]
binding = "DB"
database_name = "cleanfleet-d1"
database_id = "<YOUR_ACTUAL_D1_DATABASE_ID>"
```

### Step 3: Apply Migrations
```bash
# Apply schema and initial CF-BIKE-001 seed to Cloudflare D1
npx wrangler d1 migrations apply cleanfleet-d1 --remote
```

### Step 4: Configure Worker Secrets (Optional)
```bash
npx wrangler secret put TRACKER_SECRET
# Enter: cleanfleet-tracker-secret-token
```

### Step 5: Deploy to Cloudflare Free Tier
```bash
npm run worker:deploy
```
*Wrangler builds the frontend SPA and deploys the unified Worker + Assets to your Cloudflare account:*
```text
Deployed cleanfleet-command-center to:
https://cleanfleet-command-center.<subdomain>.workers.dev
```

---

## 8. GitHub Actions CI/CD Deployment

The repository includes `.github/workflows/deploy.yml` which automates testing, frontend compilation, D1 migrations, and deployment on every push to `main`.

### Required GitHub Secrets
In your GitHub repository under **Settings** → **Secrets and variables** → **Actions**, add:
1. `CLOUDFLARE_API_TOKEN`: Cloudflare API Token with `Workers Scripts: Edit`, `D1: Edit`, and `Account Settings: Read` permissions.
2. `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (visible on Cloudflare Dashboard sidebar).

---

## 9. Real-World A→B→C Verification Procedure

Follow this exact sequence to test the live bike tracking POC:

1. **Open iPhone Tracker**:
   - Open Safari on the iPhone and navigate to `https://<your-project>.workers.dev/tracker`.
   - Tap **Allow** when prompted for Location access ("While Using the App").
   - Tap **START TRACKING**.
   - Confirm status changes to `GPS ACTIVE` (green) with real-time speed, accuracy, and heading.
2. **Open Mac Command Center**:
   - On your Mac desktop, open `https://<your-project>.workers.dev/dashboard`.
   - Confirm header displays `GPS ● LIVE`, `TRACKER ● ONLINE`, `API ● ONLINE`, `DATABASE ● ONLINE`.
   - Observe the 3D MapLibre map with 3D buildings and the animated vehicle marker positioned at the iPhone's GPS location.
3. **Assign Route (A→B→C)**:
   - On the Mac dashboard, click **ASSIGN ROUTE**.
   - For Point A, click **USE VEHICLE GPS** (or click the map).
   - For Point B, click **SELECT ON MAP** and select an intermediate turn.
   - For Point C, click **SELECT ON MAP** and select the destination.
   - Click **CALCULATE ROUTE** to preview the OSRM geometry, distance, and duration.
   - Click **ASSIGN ROUTE**. The route will render in electric blue with an active 75m corridor buffer.
4. **Begin Bike Ride**:
   - Ride along the assigned corridor.
   - The Mac dashboard displays live vehicle movement, speed, route progress percentage, and projected ETA every 3–5 seconds.
5. **Verify Offline Queue (IndexedDB)**:
   - While riding, switch the iPhone to Airplane Mode.
   - The tracker badge switches to `OFFLINE — LOCAL QUEUE (X points saved locally)`.
   - Continue riding for 30–60 seconds; observe the queued point count incrementing.
   - Turn Airplane Mode off to restore connectivity.
   - The tracker detects the connection, displays `BACK ONLINE — SYNCING X QUEUED POINTS`, and syncs all points to D1.
   - The Mac dashboard timeline displays: `Synchronized X offline GPS points`.
6. **Verify Route Deviation & Alternate Route**:
   - Intentionally turn off the assigned corridor.
   - 1st point outside: suppressed by hysteresis.
   - 2nd consecutive point outside: triggers `⚠ ROUTE DEVIATION DETECTED`, marker pulses red, and deviation distance is shown.
   - Click **CALCULATE ALTERNATE ROUTE** to calculate a bypass route to Point C via OSRM.
7. **Verify Tracker Stop & Stale Detection**:
   - On the iPhone, tap **STOP TRACKING**.
   - At 30s: vehicle status transitions to `DELAYED` (amber).
   - At 90s: vehicle status transitions to `STALE` (grey), and ETA changes to `ETA UNAVAILABLE`.

---

## 10. Verification & Test Summary

- **Automated Tests**: 4 test suites, 18 unit tests passing via Vitest (`npm test`).
- **Production Build**: Clean bundle generated via Vite & TypeScript (`npm run build`).
- **API End-to-End**: Verified `/api/health`, `/api/gps`, `/api/gps/batch`, `/api/dashboard/state`, `/api/routes`, `/api/routes/:id/recalculate`, `/tracker`, and `/dashboard`.
- **Zero Cost**: Built entirely with MapLibre GL JS, OpenFreeMap, OSRM, Cloudflare Workers Free Tier, and Cloudflare D1 Free Tier.

