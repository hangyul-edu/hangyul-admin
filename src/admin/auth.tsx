import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, http, setAuthHandlers } from "../lib/http";
import {
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
} from "./lib/storage";
import type { AdminStoredSession } from "./lib/storage";
import type { AdminMe, TokenPair } from "./api";

type Status = "booting" | "signed-out" | "signed-in";

interface AdminAuthCtx {
  status: Status;
  me: AdminMe | null;
  /** Email/password login; verifies the account holds an admin scope set. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (scope: string) => boolean;
}

const Ctx = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("booting");
  const [me, setMe] = useState<AdminMe | null>(null);
  const sessionRef = useRef<AdminStoredSession | null>(loadAdminSession());

  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => sessionRef.current?.accessToken ?? null,
      getRefreshToken: () => sessionRef.current?.refreshToken ?? null,
      onRefreshed: (access, refresh, expiresIn) => {
        sessionRef.current = {
          accessToken: access,
          refreshToken: refresh,
          accessExpiresAt: Date.now() + expiresIn * 1000,
        };
        saveAdminSession(sessionRef.current);
      },
      onExpired: () => hardSignOut(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTokens(t: TokenPair) {
    sessionRef.current = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      accessExpiresAt: Date.now() + (t.expires_in ?? 1800) * 1000,
    };
    saveAdminSession(sessionRef.current);
  }

  function hardSignOut() {
    sessionRef.current = null;
    clearAdminSession();
    setMe(null);
    setStatus("signed-out");
    qc.clear();
  }

  async function login(email: string, password: string): Promise<void> {
    const tokens = await http.post<TokenPair>(
      "/auth/login/email",
      { email, password },
      { auth: false },
    );
    applyTokens(tokens);
    try {
      const profile = await http.get<AdminMe>("/admin/me");
      setMe(profile);
      setStatus("signed-in");
    } catch (e) {
      // Not an admin (403) or any other failure → drop the session again.
      hardSignOut();
      if (e instanceof ApiError && e.status === 403) {
        throw new ApiError(403, "forbidden", "관리자 권한이 없는 계정입니다.");
      }
      throw e;
    }
  }

  async function logout(): Promise<void> {
    const refresh = sessionRef.current?.refreshToken;
    if (refresh) {
      try {
        await http.post("/auth/logout", { refresh_token: refresh });
      } catch {
        /* best effort */
      }
    }
    hardSignOut();
  }

  // Cold-start: restore the session and re-verify admin access.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionRef.current) {
        setStatus("signed-out");
        return;
      }
      try {
        const profile = await http.get<AdminMe>("/admin/me");
        if (!cancelled) {
          setMe(profile);
          setStatus("signed-in");
        }
      } catch {
        if (!cancelled) hardSignOut();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AdminAuthCtx>(
    () => ({
      status,
      me,
      login,
      logout,
      can: (scope: string) => me?.scopes.includes(scope) ?? false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, me],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth(): AdminAuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return c;
}
