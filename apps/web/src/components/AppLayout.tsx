import { type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session.js';
import { formatCubes } from '../util/format.js';

export function AppLayout(): ReactElement {
  const { user, herd, signOut, unreadMail } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{herd?.name ?? 'Herd'}</strong>
          {/* Proper Change (§7n): the purse wears its three metals; hover for the exact count. */}
          <span className="cubes-badge" title={`${(herd?.cubes ?? 0).toLocaleString()} ⬡ (copper)`}>
            {formatCubes(herd?.cubes ?? 0)} ⬡
          </span>
        </div>
        <nav className="topnav">
          <NavLink to="/" end>
            Pasture
          </NavLink>
          <NavLink to="/care">🐴 Care</NavLink>
          <NavLink to="/garden">🌱 Garden</NavLink>
          <NavLink to="/adventure">⚔ Adventure</NavLink>
          <NavLink to="/town">
            🏘 Town
            {unreadMail > 0 && (
              <span className="mail-badge" aria-label={`${unreadMail} unread letters`}>
                {unreadMail}
              </span>
            )}
          </NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/herd">Herd</NavLink>
          <NavLink to="/guide">Guide</NavLink>
          {user?.role === 'admin' && <NavLink to="/debug">🛠 Debug</NavLink>}
        </nav>
        <button onClick={() => void signOut()}>Log out</button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
