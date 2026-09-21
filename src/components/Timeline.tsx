import React from 'react';
import { RouteEvent } from '../types';
import { Terminal, ShieldAlert, CheckCircle2, Radio, RefreshCw, AlertTriangle, Route } from 'lucide-react';

interface TimelineProps {
  events: RouteEvent[];
}

export const Timeline: React.FC<TimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-3 bg-[#050912]/80 rounded-xl border border-slate-800 text-center text-xs text-slate-500 font-mono">
        <span className="text-cyan-500/60 font-bold">$</span> NO ACTIVE TELEMETRY PACKETS DETECTED
      </div>
    );
  }

  const renderCyberTag = (type: string) => {
    switch (type) {
      case 'ROUTE_DEVIATION':
        return (
          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[9px] font-bold tracking-wider font-mono">
            [CORRIDOR_BREACH]
          </span>
        );
      case 'ROUTE_COMPLIANT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 text-[9px] font-bold tracking-wider font-mono">
            [CORRIDOR_LOCK]
          </span>
        );
      case 'TRACKER_START':
        return (
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 text-[9px] font-bold tracking-wider font-mono">
            [UPLINK_ENGAGED]
          </span>
        );
      case 'TRACKER_STOPPED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[9px] font-bold tracking-wider font-mono">
            [CARRIER_DROP]
          </span>
        );
      case 'OFFLINE_SYNC':
        return (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/50 text-[9px] font-bold tracking-wider font-mono">
            [IDB_BURST_SYNC]
          </span>
        );
      case 'ALTERNATE_ROUTE_CALCULATED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/50 text-[9px] font-bold tracking-wider font-mono">
            [OSRM_REROUTE]
          </span>
        );
      case 'ROUTE_ASSIGNED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/50 text-[9px] font-bold tracking-wider font-mono">
            [GEOFENCE_ACTIVE]
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-mono">
            [{type.slice(0, 10)}]
          </span>
        );
    }
  };

  const formatCyberPayload = (event: RouteEvent) => {
    switch (event.event_type) {
      case 'ROUTE_DEVIATION':
        return `DEVIATION +${event.distance_from_route ? Math.round(event.distance_from_route) : 0}m OUTSIDE CORRIDOR`;
      case 'ROUTE_COMPLIANT':
        return 'VEHICLE ENCLOSED IN ASSIGNED GEOFENCE';
      case 'TRACKER_START':
        return '1575.42 MHz CARRIER STREAM ACTIVE';
      case 'TRACKER_STOPPED':
        return 'TELEMETRY BROADCAST DISENGAGED';
      case 'OFFLINE_SYNC': {
        const meta = event.metadata ? JSON.parse(event.metadata) : {};
        return `DUMPED +${meta.syncedCount || 'N/A'} CACHED FIXES TO EDGE`;
      }
      case 'ALTERNATE_ROUTE_CALCULATED':
        return 'DYNAMIC BYPASS CORRIDOR SOLVED';
      case 'ROUTE_ASSIGNED':
        return 'CORRIDOR POLYGON BUFFER INITIALIZED';
      default:
        return event.event_type.replace(/_/g, ' ');
    }
  };

  // Keep latest 8 high-value events to prevent visual noise
  const displayEvents = events.slice(0, 8);

  return (
    <div className="rounded-xl bg-[#040810]/95 border border-cyan-500/20 p-2.5 font-mono shadow-xl relative overflow-hidden">
      {/* Top Cyber Terminal Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-900/40 text-[10px] text-cyan-400/80">
        <div className="flex items-center gap-1.5">
          <Terminal size={11} className="text-cyan-400 animate-pulse" />
          <span className="tracking-widest font-bold">SEC.STREAM // AUDIT_FEED</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>LIVE</span>
        </div>
      </div>

      {/* Cyber Event Stream */}
      <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1 text-[10px]">
        {displayEvents.map((evt) => {
          const date = new Date(evt.timestamp);
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          return (
            <div
              key={evt.id}
              className="flex items-center gap-2 p-1.5 rounded-md bg-slate-950/70 border border-slate-900 hover:border-cyan-500/40 transition-colors"
            >
              <span className="text-slate-400 flex-shrink-0">{timeStr}</span>
              <div className="flex-shrink-0">{renderCyberTag(evt.event_type)}</div>
              <span className="text-slate-300 truncate tracking-tight">{formatCyberPayload(evt)}</span>
            </div>
          );
        })}
      </div>

      {/* Terminal prompt cursor */}
      <div className="mt-1.5 pt-1 border-t border-slate-900/80 flex items-center text-[9px] text-slate-400">
        <span className="text-cyan-400 font-bold">$</span>
        <span className="ml-1 tracking-wider text-slate-400">listening on channel /telemetry.d1</span>
        <span className="inline-block w-1.5 h-2.5 bg-cyan-400 animate-pulse ml-1.5"></span>
      </div>
    </div>
  );
};
