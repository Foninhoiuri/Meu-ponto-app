import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import LockScreen from './pages/LockScreen';
import { NotificationsManager } from './components/NotificationsManager';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('auth_pin');
  });

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background w-full overflow-hidden">
        <NotificationsManager userId={isAuthenticated ? userId : null} />
        <Routes>
          <Route 
            path="/login" 
            element={
              isAuthenticated ? (
                <Navigate to="/" replace />
              ) : (
                <LockScreen onLogin={() => setIsAuthenticated(true)} />
              )
            } 
          />
          <Route 
            path="/" 
            element={
              isAuthenticated ? (
                <Dashboard onLogout={() => setIsAuthenticated(false)} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
