import React, { useState } from 'react';
import { GpsPoint, RouteData } from '../types';
import { api } from '../api/client';
import { CONFIG } from '../config';
import { MapPin, Navigation, CheckCircle2, ArrowRight, X, Loader2, Compass } from 'lucide-react';

interface RouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestGps: GpsPoint | null;
  onRouteCreated: (route: RouteData) => void;
  selectionMode: 'A' | 'B' | 'C' | null;
  setSelectionMode: (mode: 'A' | 'B' | 'C' | null) => void;
  pointA: { lat: number; lng: number } | null;
  pointB: { lat: number; lng: number } | null;
  pointC: { lat: number; lng: number } | null;
  setPointA: (pt: { lat: number; lng: number } | null) => void;
  setPointB: (pt: { lat: number; lng: number } | null) => void;
  setPointC: (pt: { lat: number; lng: number } | null) => void;
}

export const RouteModal: React.FC<RouteModalProps> = ({
  isOpen,
  onClose,
  latestGps,
  onRouteCreated,
  selectionMode,
  setSelectionMode,
  pointA,
  pointB,
  pointC,
  setPointA,
  setPointB,
  setPointC,
}) => {
  const [routeName, setRouteName] = useState('Metro Dispatch Corridor');
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    distanceKm: number;
    durationMin: number;
    geojson: any;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUseCurrentLocationForA = () => {
    if (!latestGps) {
      setErrorMsg('No GPS fix currently available for vehicle.');
      return;
    }
    setPointA({ lat: latestGps.latitude, lng: latestGps.longitude });
    setErrorMsg(null);
    if (selectionMode === 'A') setSelectionMode(null);
  };

  const handleCalculatePreview = async () => {
    if (!pointA || !pointC) {
      setErrorMsg('Points A and C are mandatory to calculate a route.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Build OSRM query
      const coords: [number, number][] = [[pointA.lng, pointA.lat]];
      if (pointB) {
        coords.push([pointB.lng, pointB.lat]);
      }
      coords.push([pointC.lng, pointC.lat]);

      const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
      const url = `${CONFIG.OSRM_ROUTING_URL}/${coordStr}?overview=full&geometries=geojson`;

      const res = await fetch(url);
      const data = await res.json() as any;

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        setPreviewData({
          distanceKm: Number((route.distance / 1000).toFixed(2)),
          durationMin: Math.round(route.duration / 60),
          geojson: route.geometry,
        });
      } else {
        // Fallback straight line
        setPreviewData({
          distanceKm: 2.5,
          durationMin: 10,
          geojson: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }
    } catch (err: any) {
      setErrorMsg(`Route service warning: Using direct corridor geometry (${err.message}).`);
      const coords: [number, number][] = [[pointA.lng, pointA.lat]];
      if (pointB) coords.push([pointB.lng, pointB.lat]);
      coords.push([pointC.lng, pointC.lat]);
      setPreviewData({
        distanceKm: 2.5,
        durationMin: 10,
        geojson: {
          type: 'LineString',
          coordinates: coords,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignRoute = async () => {
    if (!pointA || !pointC) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const waypoints = pointB ? [{ lat: pointB.lat, lng: pointB.lng }] : [];
      const newRoute = await api.createRoute({
        vehicleId: CONFIG.VEHICLE_ID,
        name: routeName,
        origin: pointA,
        destination: pointC,
        waypoints,
      });

      onRouteCreated(newRoute);
      setSelectionMode(null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign route');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCoord = (coord: { lat: number; lng: number } | null) => {
    if (!coord) return 'Not selected';
    return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Navigation size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">ASSIGN VEHICLE ROUTE</h2>
              <p className="text-xs text-slate-400">Configure A → B → C corridor for {CONFIG.VEHICLE_ID}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectionMode(null);
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Route Name Input */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Route Identifier
          </label>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono"
            placeholder="e.g. Mission Bay Logistics Corridor"
          />
        </div>

        {/* Waypoints Selection Flow */}
        <div className="mt-4 space-y-3">
          {/* Point A */}
          <div className={`p-3 rounded-xl border transition-all ${
            selectionMode === 'A'
              ? 'border-cyan-500 bg-cyan-950/30 shadow-cyan-glow'
              : 'border-slate-800 bg-slate-950/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-xs font-bold flex items-center justify-center">
                  A
                </span>
                <span className="text-xs font-semibold text-slate-200">ORIGIN</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocationForA}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-slate-700 transition"
                >
                  USE VEHICLE GPS
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode(selectionMode === 'A' ? null : 'A')}
                  className={`px-2 py-1 text-[10px] font-bold rounded border transition ${
                    selectionMode === 'A'
                      ? 'bg-cyan-500 text-black border-cyan-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  {selectionMode === 'A' ? 'CLICKING MAP...' : 'SELECT ON MAP'}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs font-mono text-slate-400 truncate">{formatCoord(pointA)}</p>
          </div>

          {/* Point B (Optional Waypoint) */}
          <div className={`p-3 rounded-xl border transition-all ${
            selectionMode === 'B'
              ? 'border-purple-500 bg-purple-950/30 shadow-purple-glow'
              : 'border-slate-800 bg-slate-950/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40 text-xs font-bold flex items-center justify-center">
                  B
                </span>
                <span className="text-xs font-semibold text-slate-200">WAYPOINT (OPTIONAL)</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectionMode(selectionMode === 'B' ? null : 'B')}
                className={`px-2 py-1 text-[10px] font-bold rounded border transition ${
                  selectionMode === 'B'
                    ? 'bg-purple-500 text-white border-purple-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {selectionMode === 'B' ? 'CLICKING MAP...' : 'SELECT ON MAP'}
              </button>
            </div>
            <p className="mt-1 text-xs font-mono text-slate-400 truncate">{formatCoord(pointB)}</p>
          </div>

          {/* Point C */}
          <div className={`p-3 rounded-xl border transition-all ${
            selectionMode === 'C'
              ? 'border-emerald-500 bg-emerald-950/30 shadow-lime-glow'
              : 'border-slate-800 bg-slate-950/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center justify-center">
                  C
                </span>
                <span className="text-xs font-semibold text-slate-200">DESTINATION</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectionMode(selectionMode === 'C' ? null : 'C')}
                className={`px-2 py-1 text-[10px] font-bold rounded border transition ${
                  selectionMode === 'C'
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {selectionMode === 'C' ? 'CLICKING MAP...' : 'SELECT ON MAP'}
              </button>
            </div>
            <p className="mt-1 text-xs font-mono text-slate-400 truncate">{formatCoord(pointC)}</p>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Route Preview Metrics */}
        {previewData && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-cyan-500/30 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Distance</span>
              <p className="text-lg font-bold font-mono text-cyan-400">{previewData.distanceKm} km</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Duration</span>
              <p className="text-lg font-bold font-mono text-cyan-400">{previewData.durationMin} min</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCalculatePreview}
            disabled={!pointA || !pointC || isLoading}
            className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition disabled:opacity-40 flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            CALCULATE ROUTE
          </button>

          <button
            type="button"
            onClick={handleAssignRoute}
            disabled={!pointA || !pointC || isLoading}
            className="px-5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 rounded-xl shadow-cyan-glow transition disabled:opacity-40 flex items-center gap-1.5"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            ASSIGN ROUTE
          </button>
        </div>
      </div>
    </div>
  );
};

