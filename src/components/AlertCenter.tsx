import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { EventSeverity } from '../types';

export interface AlertItem {
  id: string;
  severity: EventSeverity;
  title: string;
  message: string;
  timestamp: number;
}

interface AlertCenterProps {
  alerts: AlertItem[];
  onDismiss?: (id: string) => void;
}

export const AlertCenter: React.FC<AlertCenterProps> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) {
    return (
      <div className="p-3 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800 text-center">
        <span className="text-xs text-slate-400 font-mono">ALL SYSTEMS NOMINAL — NO ACTIVE ALERTS</span>
      </div>
    );
  }

  const getSeverityStyle = (severity: EventSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return {
          border: 'border-rose-500/80',
          bg: 'bg-rose-950/40',
          text: 'text-rose-300',
          icon: <AlertCircle size={16} className="text-rose-400 animate-pulse flex-shrink-0" />,
          badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
        };
      case 'WARNING':
        return {
          border: 'border-amber-500/80',
          bg: 'bg-amber-950/40',
          text: 'text-amber-300',
          icon: <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />,
          badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
        };
      case 'SUCCESS':
        return {
          border: 'border-emerald-500/80',
          bg: 'bg-emerald-950/40',
          text: 'text-emerald-300',
          icon: <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />,
          badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
        };
      case 'INFO':
      default:
        return {
          border: 'border-cyan-500/60',
          bg: 'bg-cyan-950/30',
          text: 'text-cyan-300',
          icon: <Info size={16} className="text-cyan-400 flex-shrink-0" />,
          badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
        };
    }
  };

  return (
    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
      {alerts.map((alert) => {
        const style = getSeverityStyle(alert.severity);
        const timeStr = new Date(alert.timestamp).toLocaleTimeString();

        return (
          <div
            key={alert.id}
            className={`flex items-start justify-between p-3 rounded-xl border backdrop-blur-md transition-all shadow-md ${style.border} ${style.bg}`}
          >
            <div className="flex items-start gap-2.5">
              {style.icon}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${style.badge}`}>
                    {alert.severity}
                  </span>
                  <span className="text-xs font-bold text-slate-100">{alert.title}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{timeStr}</span>
                </div>
                <p className={`text-xs mt-0.5 ${style.text}`}>{alert.message}</p>
              </div>
            </div>

            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                className="text-slate-400 hover:text-white transition ml-2 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

