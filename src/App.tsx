import React, { useState, useEffect } from 'react';
import { TrackerPage } from './pages/TrackerPage';
import { DashboardPage } from './pages/DashboardPage';
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

  return (
    <div className="relative w-full h-full min-h-screen bg-[#080c14]">
      {/* Route Views */}
      {currentPath === '/tracker' ? <TrackerPage /> : <DashboardPage />}
    </div>
  );
};

