import React from 'react';
import { RouteEvent } from '../types';
import { Radio, AlertTriangle, CheckCircle2, ShieldAlert, Wifi, RefreshCw, Flag } from 'lucide-react';

interface TimelineProps {
  events: RouteEvent[];
}

export const Timeline: React.FC<TimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 text-center text-xs text-slate-500 font-mono">
        NO RECORDED FLEET EVENTS
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'ROUTE_DEVIATION':
        return <ShieldAlert size={14} className="text-rose-400" />;
      case 'ROUTE_COMPLIANT':
        return <CheckCircle2 size={14} className="text-emerald-400" />;
      case 'TRACKER_STOPPED':
        return <AlertTriangle size={14} className="text-amber-400" />;
      case 'OFFLINE_SYNC':
        return <RefreshCw size={14} className="text-cyan-400" />;
      case 'ALTERNATE_ROUTE_CALCULATED':
        return <Flag size={14} className="text-purple-400" />;
      default:
        return <Radio size={14} className="text-blue-400" />;
    }
  };

  const formatEventText = (event: RouteEvent) => {
    switch (event.event_type) {
      case 'ROUTE_DEVIATION':
        return `Route deviation detected (${event.distance_from_route || '—'}m outside corridor)`;
      case 'ROUTE_COMPLIANT':
        return 'Vehicle compliant with assigned corridor';
      case 'TRACKER_START':
        return 'Tracker initialized & broadcasting';
      case 'TRACKER_STOPPED':
        return 'Tracker broadcast stopped';
      case 'OFFLINE_SYNC': {
        const meta = event.metadata ? JSON.parse(event.metadata) : {};
        return `Synchronized ${meta.syncedCount || ''} offline GPS points`;
      }
      case 'ALTERNATE_ROUTE_CALCULATED':
        return 'Alternate bypass route calculated via OSRM';
      case 'ROUTE_ASSIGNED':
        return 'New route corridor assigned';
      default:
        return event.event_type.replace(/_/g, ' ');
    }
  };

  return (
    <div className="flex flex-col gap-2 max-h-52 overflow-y-auto font-mono text-xs pr-1">
      {events.map((evt) => {
        const date = new Date(evt.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return (
          <div
            key={evt.id}
            className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
          >
            <span className="text-[10px] text-slate-400 w-16 flex-shrink-0">{timeStr}</span>
            <div className="flex-shrink-0">{getEventIcon(evt.event_type)}</div>
            <span className="text-slate-300 truncate text-[11px]">{formatEventText(evt)}</span>
          </div>
        );
      })}
    </div>
  );
};

