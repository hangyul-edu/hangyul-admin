// Admin session persistence — a separate localStorage key from the member
// app so an admin can stay signed in to both apps independently.
export interface AdminStoredSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
}

const KEY = "hangyul.admin.session.v1";

export function loadAdminSession(): AdminStoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminStoredSession;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminStoredSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  localStorage.removeItem(KEY);
}


// --- UI preferences ---------------------------------------------------------
// Kept in its own versioned key, and deliberately NOT cleared on sign-out:
// how wide someone likes their sidebar is a display preference, not session
// state, so it should survive logging out and back in.
const NAV_KEY = "hangyul.admin.sidebar.v1";

/** Whether the sidebar was last left collapsed. Defaults to expanded. */
export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === "collapsed";
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(NAV_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* preference is best-effort — never break navigation over it */
  }
}
