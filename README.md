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
folder: the API finds the portal's build and its wording catalog there.

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | API base URL. **Leave empty** for local development and when the API serves the portal itself → the portal calls `/api`. Set it for a build hosted apart from the API, e.g. `https://api.hangyul.app` (the API must then list the portal's origin in `CORS_ALLOW_ORIGINS`). | *(empty → `/api`)* |
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
and refers to `/admin/assets/…`. Deploy it either way:

- **From the API (single server).** The API serves this build at `/admin`
  when it finds `dist/admin/index.html` (by default in `../hangyul-admin`, or
  set `ADMIN_DIST` to this repository's `dist`), next to the member app at `/`.
  See `docs/architecture.md` in hangyul-api.
- **A static host.** Publish `dist/` and send `/admin` and every `/admin/*`
  route to `/admin/index.html` (SPA fallback). The checked-in `vercel.json`
  does this for Vercel (Root Directory: the repository root) and redirects
  `/` to `/admin/`.

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
