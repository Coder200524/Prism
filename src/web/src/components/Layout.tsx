import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm hover:text-slate-900 ${isActive ? "font-semibold text-indigo-600" : "text-slate-600"}`;

export function Layout() {
  const { user, isAuthenticated, isLoading, logout, hasPlatformRole, hasEventRole } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="border-b border-slate-200">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <Link to="/" className="text-lg font-semibold text-indigo-600">
            DOGFOOD Portal
          </Link>
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/events" className={navLinkClass}>
            Events
          </NavLink>
          <NavLink to="/gallery" className={navLinkClass}>
            Gallery
          </NavLink>
          {isLoading ? (
            <span className="text-sm text-slate-400">…</span>
          ) : isAuthenticated && user ? (
            <>
              {hasEventRole("PARTICIPANT") || user.platformRole === "USER" ? (
                <NavLink to="/teams" className={navLinkClass}>
                  My teams
                </NavLink>
              ) : null}
              {hasEventRole("JUDGE") ? (
                <NavLink to="/judge" className={navLinkClass}>
                  Judge
                </NavLink>
              ) : null}
              {hasPlatformRole("ORGANIZER", "ADMIN") ? (
                <NavLink to="/organize" className={navLinkClass}>
                  Organizer
                </NavLink>
              ) : null}
              {user.platformRole === "ADMIN" ? (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              ) : null}
              <span className="ml-auto text-sm text-slate-500">{user.name}</span>
              <Button type="button" variant="secondary" onClick={() => void onLogout()}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => `${navLinkClass({ isActive })} ml-auto`}
              >
                Log in
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) =>
                  `text-sm hover:text-indigo-500 ${isActive ? "font-semibold text-indigo-600" : "text-indigo-600"}`
                }
              >
                Register
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
