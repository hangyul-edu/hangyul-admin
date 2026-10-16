# 한귤 · Hangyul — Admin Portal

The desktop-first web portal for operating Hangyul: user management, content
CMS (courses, lectures and videos, sentences, quizzes), AI-generated content
review, learning analytics, commerce (plans, coupons, subscriptions,
payments), operational content (banners, notices, FAQ), notifications,
operations queues, settings and the audit trail. React + Vite + TypeScript,
served at **`/admin`**.

Hangyul is three repositories that work together:

| Repository | What it is |
|---|---|
| [hangyul-learn-app](https://github.com/hangyul-edu/hangyul-learn-app) | The member web app |
| **hangyul-admin** (this one) | The admin portal |
| hangyul-api | The backend API both apps call; it owns admin roles, scopes and the audit log (`docs/admin-portal.md` there) |

---

## 1. Requirements

- **Node.js 20.19+ or 22.12+** (Vite 7's minimum) and npm.
- The **Hangyul API** running and reachable, and an account with an admin
  role (see hangyul-api's `docs/admin-portal.md`).

## 2. Install

```bash
git clone https://github.com/hangyul-edu/hangyul-admin.git
cd hangyul-admin
npm install
cp .env.example .env    # optional; the defaults suit local development
```

Clone it next to `hangyul-api` and `hangyul-learn-app` in the same parent
folder: the API's tests check this repository's wording catalog and audit
labels there.

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | API base URL. **Leave empty** for local development → the portal calls `/api`, which the dev server proxies. Deployed builds **must** set the API's https URL, e.g. `https://api.talkhangyul.com` (see §5). | *(empty → `/api`)* |
| `VITE_DEV_BACKEND` | Where the dev server forwards `/api` (dev only). | `http://127.0.0.1:8000` |

`VITE_*` values are inlined at build time: change one, rebuild.

## 3. Run locally

```bash
npm run dev
```

Open **http://localhost:5174/admin**. `/api` is proxied to the API, so there
are no CORS issues. This is the portal's only development address: the member
app's dev server (hangyul-learn-app, port 5173) does not serve it.

## 4. Test

```bash
npm test              # vitest + Testing Library (jsdom); the API layer is mocked
npm run typecheck
```

## 5. Build and deploy

```bash
npm run build         # type-checks, then bundles into dist/admin/
npm run preview       # serves the build at http://localhost:5174/admin
```

The portal is built for the `/admin` path: everything lands in `dist/admin/`
and refers to `/admin/assets/…`. It is deployed on its own **Vercel**
project and calls the API (hangyul-api, on AWS) cross-origin. The API never
serves the portal.

### Vercel project

| Setting | Value |
|---|---|
| Git repository | `hangyul-edu/hangyul-admin` |
| Root Directory | the repository root |
| Framework preset | Vite — `vercel.json` sets build `npm run build`, output `dist`, `/admin` and `/admin/*` → `/admin/index.html` (real files such as `/admin/assets/*` are served first), and `/` → `/admin/` |
| Node.js | 20.19+ or 22.12+ (`engines` in `package.json`) |
| `VITE_API_BASE_URL` | **Required.** The API's https URL, no `/api` suffix, e.g. `https://api.talkhangyul.com`. A Vercel build without an https value fails on purpose: the `/api` default would call the portal's own domain |
| Domain | the portal's domain, e.g. `admin.talkhangyul.com`; the portal opens at `https://<admin-domain>/admin/` |

`VITE_*` values are inlined at build time: change one, redeploy with the build
cache cleared.

### What the API needs to know about the portal

| API setting | Value | Why |
|---|---|---|
| `ADMIN_WEB_APP_URL` | the portal's origin, e.g. `https://admin.talkhangyul.com` | Allows the portal's cross-origin calls (Bearer token, no cookies). It is environment-only on purpose: the CORS list on the portal's settings page can be edited, and leaving the portal out there would otherwise lock every operator out |

The portal signs in with email and password only, so it needs no social-login
or payment-return settings.

Any other static host works the same way: publish `dist/` and send `/admin`
and every `/admin/*` route to `/admin/index.html` (SPA fallback).

## 6. Project structure

```
hangyul-admin/
├─ index.html              # entry; a boot watchdog explains a blocked/failed load
├─ vite.config.ts          # base /admin/, dev server :5174, /api → backend
├─ vercel.json
└─ src/
   ├─ admin/               # the portal: main.tsx, App.tsx (router, basename /admin),
   │                       #   auth.tsx (admin session + scopes), api clients,
   │                       #   components/, pages/, lib/, styles/ (hgadm-* classes)
   ├─ lib/                 # http client (Bearer auth, refresh, error wording),
   │                       #   config, image crop, leagues, levels, HTML sanitizer…
   ├─ i18n/                # error wording (operator catalog apiErrors.admin.ko.ts
   │                       #   first, then the Korean member catalog)
   ├─ hooks/toast.tsx
   ├─ components/StreamVideo.tsx
   └─ styles/theme.css     # brand tokens; admin.css re-themes them blue
```

`src/lib`, `src/i18n`, `src/hooks`, `src/components` and `src/styles` began as
the member app's modules the portal used, and came along with their history
when the two apps were split into separate repositories. They are this
repository's own copies now. The backend's test suite checks this repository's
operator wording (`src/i18n/locales/apiErrors.admin.ko.ts`) and audit labels
(`src/admin/lib/auditActions.ts`) against the API.
