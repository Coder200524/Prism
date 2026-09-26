import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginBody, MeResponse, PublicUser, RegisterBody } from "@dogfood/shared";
import { apiRequest, getStoredToken, setStoredToken } from "../api/client";

type AuthContextValue = {
  token: string | null;
  user: PublicUser | null;
  roles: MeResponse["roles"];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
  hasPlatformRole: (...roles: PublicUser["platformRole"][]) => boolean;
  hasEventRole: (role: MeResponse["roles"][number]["role"], eventId?: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  const meQuery = useQuery({
    queryKey: ["auth", "me", token],
    enabled: Boolean(token),
    queryFn: () => apiRequest<MeResponse>("/api/auth/me", { token }),
    retry: false,
  });

  useEffect(() => {
    if (meQuery.isError && token) {
      setStoredToken(null);
      setToken(null);
    }
  }, [meQuery.isError, token]);

  const applyAuth = useCallback(
    async (nextToken: string, user: PublicUser) => {
      setStoredToken(nextToken);
      setToken(nextToken);
      queryClient.setQueryData(["auth", "me", nextToken], {
        user,
        roles: [],
      } satisfies MeResponse);
      // Fetch roles immediately so role-specific nav is available without a refresh.
      await queryClient.fetchQuery({
        queryKey: ["auth", "me", nextToken],
        queryFn: () => apiRequest<MeResponse>("/api/auth/me", { token: nextToken }),
      });
    },
    [queryClient],
  );

  const loginMutation = useMutation({
    mutationFn: (body: LoginBody) =>
      apiRequest<{ token: string; user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body,
        token: null,
      }),
    onSuccess: async (data) => {
      await applyAuth(data.token, data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (body: RegisterBody) =>
      apiRequest<{ token: string; user: PublicUser }>("/api/auth/register", {
        method: "POST",
        body,
        token: null,
      }),
    onSuccess: async (data) => {
      await applyAuth(data.token, data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (!token) return;
      await apiRequest<void>("/api/auth/logout", { method: "POST", token });
    },
    onSettled: () => {
      setStoredToken(null);
      setToken(null);
      queryClient.removeQueries({ queryKey: ["auth"] });
    },
  });

  const user = meQuery.data?.user ?? null;
  const roles = meQuery.data?.roles ?? [];

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      roles,
      isLoading: Boolean(token) && meQuery.isLoading,
      isAuthenticated: Boolean(token && user),
      login: async (body) => {
        await loginMutation.mutateAsync(body);
      },
      register: async (body) => {
        await registerMutation.mutateAsync(body);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      hasPlatformRole: (...wanted) => {
        if (!user) return false;
        if (user.platformRole === "ADMIN") return true;
        return wanted.includes(user.platformRole);
      },
      hasEventRole: (role, eventId) => {
        if (!user) return false;
        if (user.platformRole === "ADMIN") return true;
        return roles.some(
          (entry) => entry.role === role && (eventId === undefined || entry.eventId === eventId),
        );
      },
    }),
    [token, user, roles, meQuery.isLoading, loginMutation, logoutMutation, registerMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
