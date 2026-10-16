/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Hangyul API, e.g. "https://api.hangyul.app". Empty → "/api" (dev proxy). */
  readonly VITE_API_BASE_URL?: string;
  /** The member app's address, e.g. "https://talkhangyul.com". Empty → the portal does not link to it. */
  readonly VITE_MEMBER_APP_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
