import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { complianceEngine, RouteComplianceResult, RouteProgressResult, EtaResult } from '../services/complianceEngine';
import { DashboardState, GpsPoint, RouteData, VehicleStatus } from '../types';
import { CONFIG } from '../config';
import { MapLibre3D } from '../map/MapLibre3D';
import { RouteModal } from '../components/RouteModal';
import { AlertCenter, AlertItem } from '../components/AlertCenter';
import { Timeline } from '../components/Timeline';
import {
  Activity,
  Compass,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Clock,
  Gauge,
  MapPin,
  RefreshCw,
  PlusCircle,
  Route,
  Zap,
  WifiOff,
  Server,
  Database,
  ArrowRight,
  TrendingUp,
  Cpu
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);
  const [isCommandCenterOnline, setIsCommandCenterOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [apiOnline, setApiOnline] = useState<boolean>(true);
  const [dbOnline, setDbOnline] = useState<boolean>(true);
  const [lastPollTime, setLastPollTime] = useState<number>(Date.now());
  const [secondsSinceLastGps, setSecondsSinceLastGps] = useState<number>(0);

  // Compliance, Progress, and ETA states
  const [compliance, setCompliance] = useState<RouteComplianceResult>({
    isCompliant: true,
    distanceFromRouteMeters: 0,
    consecutiveDeviations: 0,
    deviationAlert: false,
    alertMessage: null,
    nearestPointCoords: null,
  });
  const [progress, setProgress] = useState<RouteProgressResult>({
    completedMeters: 0,
    remainingMeters: 0,
    totalMeters: 0,
    progressPercent: 0,
    isArrived: false,
  });
  const [eta, setEta] = useState<EtaResult>({
    status: 'ACTIVE',
    etaMinutes: null,
    formattedEta: '—',
  });
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>('IDLE');

  // Alternate Route state
  const [alternateRoute, setAlternateRoute] = useState<any | null>(null);
  const [alternateRouteMeta, setAlternateRouteMeta] = useState<{
    distanceDelta: number;
    durationDelta: number;
  } | null>(null);
  const [isCalculatingAlt, setIsCalculatingAlt] = useState<boolean>(false);
  const [altError, setAltError] = useState<string | null>(null);

  // Route Creator Modal & Waypoint Selections
  const [isRouteModalOpen, setIsRouteModalOpen] = useState<boolean>(false);
  const [selectionMode, setSelectionMode] = useState<'A' | 'B' | 'C' | null>(null);
  const [pointA, setPointA] = useState<{ lat: number; lng: number } | null>(null);
  const [pointB, setPointB] = useState<{ lat: number; lng: number } | null>(null);
  const [pointC, setPointC] = useState<{ lat: number; lng: number } | null>(null);

  // Dynamic Alerts List
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Polling loop
  const pollDashboard = useCallback(async () => {
    try {
      const state = await api.getDashboardState(CONFIG.VEHICLE_ID);
      setDashboardState(state);
      setApiOnline(true);
      setDbOnline(true);
      setLastPollTime(Date.now());

      const latest = state.latestGps;
      const route = state.activeRoute;

      // 1. Evaluate Route Compliance
      const compRes = complianceEngine.checkCompliance(latest, route);
      setCompliance(compRes);

      // 2. Evaluate Progress
      const progRes = complianceEngine.calculateProgress(latest, route);
      setProgress(progRes);

      // 3. Evaluate Status (LIVE, DELAYED, STALE, DEVIATION)
      const currentStatus = complianceEngine.evaluateVehicleStatus(
        latest?.timestamp || null,
        compRes.deviationAlert,
        Date.now()
      );
      setVehicleStatus(currentStatus);

      // 4. Calculate ETA
      const speedKmh = latest?.speed ? Math.round(latest.speed * 3.6) : 0;
      const etaRes = complianceEngine.calculateEta(progRes, speedKmh, currentStatus);
      setEta(etaRes);

      // 5. Manage Alerts based on live conditions
      const newAlerts: AlertItem[] = [];

      if (compRes.deviationAlert) {
        newAlerts.push({
          id: 'deviation-alert',
          severity: 'CRITICAL',
          title: 'ROUTE DEVIATION DETECTED',
          message: compRes.alertMessage || `Vehicle is outside the ${CONFIG.ROUTE_DEVIATION_THRESHOLD_METERS}m corridor`,
          timestamp: Date.now(),
        });
      } else if (route && compRes.isCompliant) {
        newAlerts.push({
          id: 'route-compliant',
          severity: 'SUCCESS',
          title: 'ROUTE COMPLIANT',
          message: 'Vehicle tracking within designated corridor',
          timestamp: Date.now(),
        });
      }

      if (currentStatus === 'DELAYED') {
        newAlerts.push({
          id: 'status-delayed',
          severity: 'WARNING',
          title: 'TRACKER DELAYED',
          message: 'No GPS broadcast for > 30 seconds',
          timestamp: Date.now(),
        });
      } else if (currentStatus === 'STALE') {
        newAlerts.push({
          id: 'status-stale',
          severity: 'CRITICAL',
          title: 'TRACKER STOPPED / STALE',
          message: 'GPS stream interrupted (> 90 seconds)',
          timestamp: Date.now(),
        });
      }

      if (progRes.isArrived) {
        newAlerts.push({
          id: 'route-arrived',
          severity: 'SUCCESS',
          title: 'DESTINATION REACHED',
          message: 'Vehicle arrived at destination waypoint C',
          timestamp: Date.now(),
        });
      }

      setAlerts(newAlerts);
    } catch (err: any) {
      console.error('[Dashboard] State fetch failed:', err);
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    pollDashboard();
    const interval = setInterval(pollDashboard, CONFIG.DASHBOARD_POLL_INTERVAL_MS);

    const onOnline = () => {
      setIsCommandCenterOnline(true);
      pollDashboard();
    };
    const onOffline = () => setIsCommandCenterOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [pollDashboard]);

  // Live seconds ticker since last GPS fix
  useEffect(() => {
    const timer = setInterval(() => {
      if (dashboardState?.latestGps?.timestamp) {
        const sec = Math.floor((Date.now() - dashboardState.latestGps.timestamp) / 1000);
        setSecondsSinceLastGps(Math.max(0, sec));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [dashboardState]);

  // Handle map click when selecting points for route creation
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (!selectionMode) return;
    if (selectionMode === 'A') {
      setPointA(coords);
      setSelectionMode('B');
    } else if (selectionMode === 'B') {
      setPointB(coords);
      setSelectionMode('C');
    } else if (selectionMode === 'C') {
      setPointC(coords);
      setSelectionMode(null);
      setIsRouteModalOpen(true);
    }
  };

  // Calculate Alternate Route
  const handleCalculateAlternate = async () => {
    if (!dashboardState?.activeRoute || !dashboardState?.latestGps) {
      setAltError('No active route or GPS coordinate available');
      return;
    }

    setIsCalculatingAlt(true);
    setAltError(null);

    try {
      const res = await api.recalculateRoute(
        dashboardState.activeRoute.id,
        dashboardState.latestGps.latitude,
        dashboardState.latestGps.longitude
      );

      setAlternateRoute(res.alternateRouteGeoJson);
      setAlternateRouteMeta({
        distanceDelta: res.distanceDeltaMeters,
        durationDelta: res.durationDeltaSeconds,
      });
    } catch (err: any) {
      setAltError('Alternate route unavailable');
      setAlternateRoute(null);
    } finally {
      setIsCalculatingAlt(false);
    }
  };

  const speedKmh = dashboardState?.latestGps?.speed
    ? Math.round(dashboardState.latestGps.speed * 3.6)
    : 0;

  const distanceTravelledKm = progress.completedMeters > 0
    ? (progress.completedMeters / 1000).toFixed(2)
    : '0.00';

  const getStatusBadge = (status: VehicleStatus) => {
    switch (status) {
      case 'LIVE':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-lime-glow">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-bold tracking-wider">LIVE</span>
          </div>
        );
      case 'DELAYED':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-amber-glow">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span className="text-xs font-bold tracking-wider">DELAYED</span>
          </div>
        );
      case 'DEVIATION':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/60 shadow-rose-glow animate-pulse">
            <AlertTriangle size={13} />
            <span className="text-xs font-bold tracking-wider">DEVIATION</span>
          </div>
        );
      case 'STALE':
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span className="text-xs font-bold tracking-wider">STALE</span>
          </div>
        );
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#080c14] text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* 1. TOP COMMAND HEADER */}
      <header className="h-16 px-6 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between z-20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-sm bg-cyan-400 shadow-cyan-glow transform rotate-45"></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
                  CLEANFLEET COMMAND CENTER
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  3D LIVE OPERATIONS
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 tracking-wider">
                3D LIVE VEHICLE TRACKING & ROUTE COMPLIANCE
              </p>
            </div>
          </div>
        </div>

        {/* System Health Indicators */}
        <div className="flex items-center gap-6 font-mono text-xs">
          <div className="hidden lg:flex items-center gap-5">
            {/* GPS State */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">GPS</span>
              <span className={`flex items-center gap-1 font-bold ${
                vehicleStatus === 'LIVE' ? 'text-emerald-400' : vehicleStatus === 'DELAYED' ? 'text-amber-400' : 'text-slate-400'
              }`}>
                ● {vehicleStatus}
              </span>
            </div>

            {/* Tracker Connection */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">TRACKER</span>
              <span className={`flex items-center gap-1 font-bold ${
                vehicleStatus !== 'STALE' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                ● {vehicleStatus !== 'STALE' ? 'ONLINE' : 'STOPPED'}
              </span>
            </div>

            {/* Edge API */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">API</span>
              <span className={`flex items-center gap-1 font-bold ${apiOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                ● {apiOnline ? 'ONLINE' : 'ERROR'}
              </span>
            </div>

            {/* D1 Database */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">DATABASE</span>
              <span className={`flex items-center gap-1 font-bold ${dbOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                ● {dbOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {/* Network */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">NETWORK</span>
              <span className={`flex items-center gap-1 font-bold ${isCommandCenterOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                ● {isCommandCenterOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden lg:block"></div>

          {/* Clock */}
          <div className="flex items-center gap-2 text-slate-300">
            <Clock size={14} className="text-cyan-400" />
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      {/* OFFLINE DASHBOARD NOTICE BANNER */}
      {!isCommandCenterOnline && (
        <div className="bg-amber-950/90 border-b border-amber-500/80 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-30 font-mono">
          <div className="flex items-center gap-2">
            <WifiOff size={15} className="animate-pulse" />
            <span>COMMAND CENTER OFFLINE — Preserving last known vehicle state.</span>
          </div>
          <span>Last received location: {secondsSinceLastGps} sec ago</span>
        </div>
      )}

      {/* 2. MAIN WORKSPACE (FULLSCREEN 3D MAP + FLOATING HUD PANELS) */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* Fullscreen 3D Map Component */}
        <MapLibre3D
          latestGps={dashboardState?.latestGps || null}
          activeRoute={dashboardState?.activeRoute || null}
          alternateRouteGeoJson={alternateRoute}
          vehicleStatus={vehicleStatus}
          isDeviated={compliance.deviationAlert}
          onMapClick={handleMapClick}
          selectionMode={selectionMode}
          waypointSelections={{ pointA, pointB, pointC }}
        />

        {/* LEFT HUD: TELEMETRY & ROUTE CARD */}
        <div className="absolute top-4 left-4 z-10 w-96 max-w-[calc(100vw-2rem)] flex flex-col gap-3 pointer-events-auto">
          {/* Main Vehicle Card */}
          <div className="p-5 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 shadow-2xl">
            {/* Vehicle Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Cpu size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-wider text-slate-100 font-mono">
                    {dashboardState?.vehicle?.vehicle_code || CONFIG.VEHICLE_ID}
                  </h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {dashboardState?.vehicle?.name || 'CleanFleet Test Bike'}
                  </p>
                </div>
              </div>
              {getStatusBadge(vehicleStatus)}
            </div>

            {/* Speedometer Display */}
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  VEHICLE SPEED
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300">
                    {speedKmh}
                  </span>
                  <span className="text-xs font-bold text-cyan-400 font-mono">km/h</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  LAST UPDATE
                </span>
                <p className="text-sm font-mono font-bold text-slate-200">
                  {secondsSinceLastGps}s ago
                </p>
              </div>
            </div>

            {/* Metrics Matrix */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">DISTANCE TRAVELLED</span>
                <span className="text-sm font-bold text-slate-200 mt-0.5 block">{distanceTravelledKm} km</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">PROJECTED ETA</span>
                <span className="text-sm font-bold text-cyan-300 mt-0.5 block">{eta.formattedEta}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">GPS ACCURACY</span>
                <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                  {dashboardState?.latestGps ? `±${dashboardState.latestGps.accuracy} m` : '—'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">CORRIDOR STATUS</span>
                <span className={`text-sm font-bold mt-0.5 block ${compliance.isCompliant ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {compliance.isCompliant ? 'COMPLIANT' : 'DEVIATED'}
                </span>
              </div>
            </div>

            {/* Route Progress Visualizer */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">ROUTE PROGRESS</span>
                <span className="text-cyan-400 font-bold">{progress.progressPercent}%</span>
              </div>

              {/* Progress Track */}
              <div className="relative h-2 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 shadow-cyan-glow"
                  style={{ width: `${progress.progressPercent}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                <span>A (ORIGIN)</span>
                <span>B</span>
                <span>C (DEST)</span>
              </div>
            </div>

            {/* Route Deviation Warning & Alternate Route Action */}
            {compliance.deviationAlert && (
              <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/80 text-rose-200 text-xs shadow-rose-glow animate-pulse">
                <div className="flex items-center gap-2 font-bold text-rose-300">
                  <AlertTriangle size={16} />
                  <span>⚠ ROUTE DEVIATION DETECTED</span>
                </div>
                <p className="mt-1 text-[11px] font-mono">
                  {compliance.distanceFromRouteMeters}m outside corridor. Hysteresis confirmed.
                </p>

                <button
                  type="button"
                  onClick={handleCalculateAlternate}
                  disabled={isCalculatingAlt}
                  className="mt-3 w-full py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-lg tracking-wider text-[11px] uppercase shadow-amber-glow transition flex items-center justify-center gap-1.5"
                >
                  <Route size={14} />
                  {isCalculatingAlt ? 'CALCULATING...' : 'CALCULATE ALTERNATE ROUTE'}
                </button>

                {altError && (
                  <p className="mt-1.5 text-[10px] text-rose-300 font-mono text-center">{altError}</p>
                )}
              </div>
            )}

            {/* Alternate Route Result Summary */}
            {alternateRoute && alternateRouteMeta && (
              <div className="mt-3 p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/50 text-xs font-mono">
                <span className="text-purple-300 font-bold text-[10px] uppercase block">
                  ALTERNATE ROUTE ACTIVE (OSRM)
                </span>
                <div className="mt-1 text-slate-300 flex justify-between">
                  <span>Delta Distance:</span>
                  <span className={alternateRouteMeta.distanceDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {(alternateRouteMeta.distanceDelta / 1000).toFixed(2)} km
                  </span>
                </div>
                <div className="text-slate-300 flex justify-between">
                  <span>Delta Duration:</span>
                  <span>{Math.round(alternateRouteMeta.durationDelta / 60)} min</span>
                </div>
              </div>
            )}
          </div>

          {/* Route Management & Create Route Trigger */}
          <div className="p-4 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  ASSIGNED CORRIDOR
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {dashboardState?.activeRoute?.name || 'No corridor currently active'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRouteModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 text-xs font-bold tracking-wider uppercase transition flex items-center gap-1.5"
              >
                <PlusCircle size={14} />
                <span>ASSIGN ROUTE</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT HUD: ALERTS & REAL EVENT TIMELINE */}
        <div className="absolute top-4 right-4 z-10 w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-3 pointer-events-auto">
          {/* Active Alerts Panel */}
          <div className="p-4 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider uppercase">
                OPERATIONAL ALERTS
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {alerts.length} ACTIVE
              </span>
            </div>
            <AlertCenter alerts={alerts} />
          </div>

          {/* Live Event Timeline */}
          <div className="p-4 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800/90 shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider uppercase">
                LIVE AUDIT TIMELINE
              </span>
              <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                STREAMING
              </span>
            </div>
            <Timeline events={dashboardState?.recentEvents || []} />
          </div>
        </div>
      </div>

      {/* 3. ROUTE CREATION MODAL */}
      <RouteModal
        isOpen={isRouteModalOpen}
        onClose={() => setIsRouteModalOpen(false)}
        latestGps={dashboardState?.latestGps || null}
        onRouteCreated={(newRoute) => {
          setDashboardState((prev) => prev ? { ...prev, activeRoute: newRoute } : null);
          pollDashboard();
        }}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        pointA={pointA}
        pointB={pointB}
        pointC={pointC}
        setPointA={setPointA}
        setPointB={setPointB}
        setPointC={setPointC}
      />
    </div>
  );
};

