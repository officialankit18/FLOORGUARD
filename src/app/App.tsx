import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MobileAppChrome } from '../components/layout/MobileAppChrome';
import { DashboardPage } from '../pages/DashboardPage';
import { CameraPage } from '../pages/CameraPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SplashScreen } from '../components/branding/SplashScreen';
import { useAlertNotifications } from '../hooks/useAlertNotifications';

export const App: React.FC = () => {
  useAlertNotifications();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  if (isLoading) return <SplashScreen />;

  return (
    <BrowserRouter>
      <MobileAppChrome>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/project" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MobileAppChrome>
    </BrowserRouter>
  );
};
