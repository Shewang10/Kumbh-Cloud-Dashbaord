import React, { useState, useEffect } from 'react';
import { TrackerPage } from './pages/TrackerPage';
import { DashboardPage } from './pages/DashboardPage';
import { Smartphone, LayoutDashboard } from 'lucide-react';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('tracker')) return '/tracker';
      if (path.includes('dashboard')) return '/dashboard';
      // Default based on screen width / mobile detection
      return window.innerWidth < 768 ? '/tracker' : '/dashboard';
    }
    return '/dashboard';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('tracker')) {
        setCurrentPath('/tracker');
      } else {
        setCurrentPath('/dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#080c14]">
      {/* Route Views */}
      {currentPath === '/tracker' ? <TrackerPage /> : <DashboardPage />}

      {/* Floating Quick Route Switcher (Subtle dev/testing HUD at bottom right) */}
      <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1 p-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 shadow-xl text-[11px] font-mono">
        <button
          type="button"
          onClick={() => navigate('/tracker')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition ${
            currentPath === '/tracker'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Switch to Mobile Tracker View (/tracker)"
        >
          <Smartphone size={13} />
          <span>TRACKER</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition ${
            currentPath === '/dashboard'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Switch to Mac Command Center (/dashboard)"
        >
          <LayoutDashboard size={13} />
          <span>DASHBOARD</span>
        </button>
      </div>
    </div>
  );
};

