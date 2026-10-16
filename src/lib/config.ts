/**
 * Resolve the API base URL.
 * - Production: set VITE_API_BASE_URL to the backend origin.
 * - Development: leave it empty → "/api", which the Vite dev server proxies to
 *   the backend (vite.config.ts), so the browser never makes a cross-origin call.
 */
const raw = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
export const API_BASE_URL = raw ? raw.replace(/\/+$/, "") : "/api";

/** The member app's address (its own domain), or null when not configured —
 * then nothing in the portal links to it. */
const member = (import.meta.env.VITE_MEMBER_APP_URL ?? "").trim();
export const MEMBER_APP_URL: string | null = member ? member.replace(/\/+$/, "") : null;
