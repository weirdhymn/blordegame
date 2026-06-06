import { type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout.js';
import { BreedPage } from './pages/BreedPage.js';
import { DebugPage } from './pages/DebugPage.js';
import { ExplorePage } from './pages/ExplorePage.js';
import { FieldGuidePage } from './pages/FieldGuidePage.js';
import { HomePage } from './pages/HomePage.js';
import { HorseDetailPage } from './pages/HorseDetailPage.js';
import { JournalPage } from './pages/JournalPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { TavernPage } from './pages/TavernPage.js';
import { WorkshopPage } from './pages/WorkshopPage.js';
import { MarketPage } from './pages/MarketPage.js';
import { HerdPage } from './pages/HerdPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { RenderDevPage } from './pages/RenderDevPage.js';
import { useSession } from './session.js';

/** Gate the authed area on a session; bounce to /login otherwise. */
function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const { user, loading } = useSession();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/render" element={<RenderDevPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/horses/:id" element={<HorseDetailPage />} />
        <Route path="/breed" element={<BreedPage />} />
        <Route path="/tavern" element={<TavernPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/workshop" element={<WorkshopPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/herd" element={<HerdPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/guide" element={<FieldGuidePage />} />
        <Route path="/debug" element={<DebugPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
