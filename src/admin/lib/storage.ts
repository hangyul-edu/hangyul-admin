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
