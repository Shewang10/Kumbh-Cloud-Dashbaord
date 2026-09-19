import React, { useEffect, useState } from 'react';
import { trackerService, TrackerStatus, TrackerDiagnostics } from '../gps/trackerService';
import { GpsPoint } from '../types';
import { CONFIG } from '../config';
import {
  Activity,
  Compass,
  Wifi,
  WifiOff,
  Database,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Battery,
  Layers,
  Clock,
  Navigation
} from 'lucide-react';

export const TrackerPage: React.FC = () => {
  const [status, setStatus] = useState<TrackerStatus>('STOPPED');
  const [currentPoint, setCurrentPoint] = useState<GpsPoint | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [diagnostics, setDiagnostics] = useState<TrackerDiagnostics>({
    totalPointsCaptured: 0,
    totalPointsSynced: 0,
    lastSyncAttempt: null,
    lastSyncSuccess: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    batteryLevel: null,
    isCharging: null,
    connectionType: null,
  });
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = trackerService.subscribe((state) => {
      setStatus(state.status);
      setCurrentPoint(state.currentPoint);
      setIsOnline(state.isOnline);
      setQueuedCount(state.queuedCount);
      setDiagnostics(state.diagnostics);
      setSyncMessage(state.syncMessage);
    });

    return () => unsubscribe();
  }, []);

  const handleStartTracking = async () => {
    await trackerService.start();
  };

  const handleStopTracking = async () => {
    await trackerService.stop();
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await trackerService.syncQueuedPoints();
    setIsSyncing(false);
  };

  // Convert m/s to km/h
  const speedKmh = currentPoint?.speed !== null && currentPoint?.speed !== undefined
    ? Math.round(currentPoint.speed * 3.6)
    : 0;

  const headingDeg = currentPoint?.heading !== null && currentPoint?.heading !== undefined
    ? `${currentPoint.heading}°`
    : '—';

  const lastGpsTime = currentPoint
    ? new Date(currentPoint.timestamp).toLocaleTimeString()
    : '—';

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 p-4 max-w-md mx-auto flex flex-col justify-between font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Header */}
      <div>
        <header className="flex items-center justify-between py-2 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-cyan-glow"></span>
              <h1 className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                CLEANFLEET
              </h1>
            </div>
            <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
              VEHICLE TRACKER
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 border border-slate-700 px-2 py-1 rounded">
              {CONFIG.VEHICLE_ID}
            </span>
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
              {isOnline ? (
                <Wifi size={16} className="text-emerald-400" />
              ) : (
                <WifiOff size={16} className="text-rose-400 animate-pulse" />
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Status Card */}
        <div className="mt-4">
          {status === 'ACTIVE' && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/50 shadow-lime-glow transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-black tracking-wider text-emerald-400">GPS ACTIVE</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    BG KEEP-ALIVE
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    LIVE
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-400 font-mono">
                {syncMessage || 'Broadcasting coordinates to Cloudflare edge'}
              </p>
              <div className="mt-2 pt-2 border-t border-emerald-900/40 flex items-center justify-between text-[10px] font-mono text-emerald-300/80">
                <span>SCREEN WAKE LOCK: ACTIVE</span>
                <span>AUDIO KEEP-ALIVE: ON</span>
              </div>
            </div>
          )}

          {status === 'OFFLINE' && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/60 to-slate-900 border border-amber-500/50 shadow-amber-glow transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WifiOff size={18} className="text-amber-400 animate-pulse" />
                  <span className="text-sm font-black tracking-wider text-amber-400">OFFLINE</span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  LOCAL QUEUE
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-200/80 font-mono">
                No internet connection. GPS points are being saved locally in IndexedDB.
              </p>
            </div>
          )}

          {status === 'DENIED' && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/70 to-slate-900 border border-rose-500/60 shadow-rose-glow">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} />
                <span className="text-sm font-black tracking-wider">PERMISSION DENIED</span>
              </div>
              <p className="mt-2 text-xs text-rose-200">
                Location access was blocked. To track this vehicle:
              </p>
              <ol className="mt-1.5 text-xs text-slate-300 list-decimal list-inside space-y-1">
                <li>Tap the <strong>AA</strong> or lock icon in Safari address bar.</li>
                <li>Tap <strong>Website Settings</strong> → <strong>Location</strong> → Allow.</li>
                <li>Reload this page.</li>
              </ol>
            </div>
          )}

          {status === 'STOPPED' && (
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-600"></span>
                  <span className="text-sm font-bold tracking-wider text-slate-400">TRACKING STOPPED</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">STANDBY</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Tap START TRACKING below to begin transmitting live GPS coordinates.
              </p>
            </div>
          )}

          {status === 'STARTING' && (
            <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 animate-pulse">
              <div className="flex items-center gap-2 text-cyan-400">
                <RefreshCw size={18} className="animate-spin" />
                <span className="text-sm font-bold">INITIALIZING SATELLITE FIX...</span>
              </div>
            </div>
          )}
        </div>

        {/* Speedometer & Primary Metric Display */}
        <div className="mt-5 p-6 rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,240,255,0.08),transparent_70%)] pointer-events-none"></div>

          <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
            CURRENT GROUND SPEED
          </span>

          <div className="mt-2 flex items-baseline justify-center gap-2">
            <span className="text-6xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300">
              {status === 'ACTIVE' || status === 'OFFLINE' ? speedKmh : 0}
            </span>
            <span className="text-sm font-bold text-cyan-400 font-mono">km/h</span>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-left">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">HEADING</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Navigation
                  size={14}
                  className="text-cyan-400 transition-transform duration-300"
                  style={{ transform: `rotate(${currentPoint?.heading || 0}deg)` }}
                />
                <span className="text-sm font-mono font-bold text-slate-200">{headingDeg}</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">GPS ACCURACY</span>
              <p className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                {currentPoint ? `±${currentPoint.accuracy} m` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono uppercase">
              <Clock size={12} />
              <span>LAST GPS FIX</span>
            </div>
            <p className="mt-1 text-sm font-bold font-mono text-slate-200">{lastGpsTime}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono uppercase">
                <Database size={12} />
                <span>OFFLINE QUEUE</span>
              </div>
              {queuedCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              )}
            </div>
            <p className={`mt-1 text-sm font-bold font-mono ${queuedCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {queuedCount} points
            </p>
          </div>
        </div>

        {/* Collapsible GPS Diagnostics Panel */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 transition"
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-cyan-400" />
              <span>GPS DIAGNOSTICS & TELEMETRY</span>
            </div>
            {showDiagnostics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showDiagnostics && (
            <div className="mt-2 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2.5 animate-fadeIn">
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">LATITUDE</span>
                <span className="text-cyan-300">{currentPoint ? currentPoint.latitude.toFixed(6) : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">LONGITUDE</span>
                <span className="text-cyan-300">{currentPoint ? currentPoint.longitude.toFixed(6) : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">POINTS CAPTURED</span>
                <span className="text-slate-200">{diagnostics.totalPointsCaptured}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-500">POINTS SYNCED</span>
                <span className="text-emerald-400">{diagnostics.totalPointsSynced}</span>
              </div>
              {diagnostics.batteryLevel !== null && (
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-500">PHONE BATTERY</span>
                  <span className="text-slate-200">
                    {diagnostics.batteryLevel}% {diagnostics.isCharging ? '(CHARGING)' : ''}
                  </span>
                </div>
              )}
              {diagnostics.connectionType && (
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-500">NETWORK TYPE</span>
                  <span className="text-slate-200 uppercase">{diagnostics.connectionType}</span>
                </div>
              )}
              {diagnostics.lastErrorMessage && (
                <div className="text-[11px] text-rose-400 pt-1">
                  LAST ERROR: {diagnostics.lastErrorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons (Sticky at bottom on iPhone) */}
      <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-2.5 pb-6">
        {status !== 'ACTIVE' && status !== 'OFFLINE' ? (
          <button
            type="button"
            onClick={handleStartTracking}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-600 text-slate-950 font-black text-sm tracking-wider uppercase shadow-cyan-glow active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Play size={18} fill="currentColor" />
            START TRACKING
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStopTracking}
            className="w-full py-4 rounded-2xl bg-rose-600/90 hover:bg-rose-600 text-white font-black text-sm tracking-wider uppercase shadow-rose-glow active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Square size={18} fill="currentColor" />
            STOP TRACKING
          </button>
        )}

        <button
          type="button"
          onClick={handleManualSync}
          disabled={queuedCount === 0 || !isOnline || isSyncing}
          className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-300 font-bold text-xs tracking-wider uppercase disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          <span>SYNC NOW ({queuedCount})</span>
        </button>
      </div>
    </div>
  );
};

