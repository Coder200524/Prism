import { Navigate, useLocation } from "react-router-dom";
import type { PublicUser } from "@dogfood/shared";
import { useAuth } from "./AuthContext";

type RequireRoleProps = {
  platformRoles?: PublicUser["platformRole"][];
  children: React.ReactNode;
};

export function RequireRole({ platformRoles, children }: RequireRoleProps) {
  const { isLoading, isAuthenticated, hasPlatformRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p className="text-df-dim">Loading…</p>;
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (platformRoles && platformRoles.length > 0 && !hasPlatformRole(...platformRoles)) {
    return <p className="text-df-pink">You do not have access to this page.</p>;
  }

  return <>{children}</>;
}
