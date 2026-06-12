import { lazy, Suspense, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

// The whole authed game is one lazy chunk (audit P2): /login and /register ship a slim
// bundle without the vendored genetics engine; the game loads when a session exists.
const AuthedApp = lazy(() => import('./AuthedApp.js'));

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/*"
        element={
          <Suspense fallback={<div className="loading">Loading…</div>}>
            <AuthedApp />
          </Suspense>
        }
      />
    </Routes>
  );
}
