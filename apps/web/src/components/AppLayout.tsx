import { type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session.js';

export function AppLayout(): ReactElement {
  const { herd, signOut } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{herd?.name ?? 'Herd'}</strong>
          <span className="cubes-badge">{herd?.cubes ?? 0} ⬡</span>
        </div>
        <nav className="topnav">
          <NavLink to="/" end>
            Pasture
          </NavLink>
          <NavLink to="/breed">Breed</NavLink>
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/journal">Journal</NavLink>
          <NavLink to="/guide">Guide</NavLink>
        </nav>
        <button onClick={() => void signOut()}>Log out</button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
