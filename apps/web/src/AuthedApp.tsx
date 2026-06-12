import { type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout.js';
import { AdventurePage } from './pages/AdventurePage.js';
import { BreedPage } from './pages/BreedPage.js';
import { CarePage } from './pages/CarePage.js';
import { DebugPage } from './pages/DebugPage.js';
import { FieldGuidePage } from './pages/FieldGuidePage.js';
import { GardenPage } from './pages/GardenPage.js';
import { HomePage } from './pages/HomePage.js';
import { HorseDetailPage } from './pages/HorseDetailPage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { JournalPage } from './pages/JournalPage.js';
import { TavernPage } from './pages/TavernPage.js';
import { TownPage } from './pages/TownPage.js';
import { WorkshopPage } from './pages/WorkshopPage.js';
import { MarketPage } from './pages/MarketPage.js';
import { HerdPage } from './pages/HerdPage.js';
import { PostOfficePage } from './pages/PostOfficePage.js';
import { RenderDevPage } from './pages/RenderDevPage.js';
import { ShrinePage } from './pages/ShrinePage.js';
import { StudbookPage } from './pages/StudbookPage.js';
import { SparPage } from './pages/SparPage.js';
import { VenturePage } from './pages/VenturePage.js';
import { useSession } from './session.js';

/** Gate the authed area on a session; bounce to /login otherwise. */
function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const { user, loading } = useSession();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Everything behind the login — split into its own lazy chunk (audit P2) so /login and
 * /register ship without the vendored genetics engine (~110KB) and the rest of the game.
 * Default export: React.lazy needs one. Routes are RELATIVE — App mounts this at `/*`.
 */
export default function AuthedApp(): ReactElement {
  return (
    <Routes>
      {/* The render dev page is public but engine-heavy — it belongs in this chunk. */}
      <Route path="render" element={<RenderDevPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="" element={<HomePage />} />
        <Route path="care" element={<CarePage />} />
        <Route path="garden" element={<GardenPage />} />
        <Route path="horses/:id" element={<HorseDetailPage />} />
        <Route path="breed" element={<BreedPage />} />
        <Route path="town" element={<TownPage />} />
        <Route path="town/tavern" element={<TavernPage />} />
        <Route path="town/workshop" element={<WorkshopPage />} />
        <Route path="town/market" element={<MarketPage />} />
        <Route path="town/shrine" element={<ShrinePage />} />
        <Route path="town/studbook" element={<StudbookPage />} />
        <Route path="town/post" element={<PostOfficePage />} />
        {/* Old flat routes redirect into the Town so existing links never break. */}
        <Route path="tavern" element={<Navigate to="/town/tavern" replace />} />
        <Route path="adventure" element={<AdventurePage />} />
        <Route path="adventure/venture" element={<VenturePage />} />
        <Route path="adventure/spar" element={<SparPage />} />
        {/* Old routes redirect into the Adventure hub so existing links never break. */}
        <Route path="world" element={<Navigate to="/adventure/venture" replace />} />
        <Route path="explore" element={<Navigate to="/adventure/venture" replace />} />
        <Route path="spar" element={<Navigate to="/adventure/spar" replace />} />
        <Route path="workshop" element={<Navigate to="/town/workshop" replace />} />
        <Route path="market" element={<Navigate to="/town/market" replace />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="herd" element={<HerdPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="guide" element={<FieldGuidePage />} />
        <Route path="debug" element={<DebugPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
