# Mobile app integration

How the Android app (`app-ui`), the production web app (`rnd-ui`) and the shared backend (`rnd-service`) fit together.

## 1. Repository layout

```
sai-ram/
├── rnd-service/   Common backend for web and mobile (Express + MongoDB + Redis)
├── rnd-ui/        Production web application (unchanged by the mobile integration)
└── app-ui/        Mobile application frontend (React + Capacitor, Android)
```

Both frontends talk to the same backend. `app-ui` is a separate app, not a mode of `rnd-ui`.
`app-ui/.github/workflows/*` are kept as reference only: GitHub runs workflows only from the repository root `.github/`, so they must be moved (with `working-directory: app-ui`) before they can be used.

## 2. Authentication: web vs. mobile

| | Web (`rnd-ui`) | Android (`app-ui`) |
|---|---|---|
| Identification | no special header | `X-Client: native-app` on every request |
| Access token | JWT in the JSON body, short-lived | same |
| Refresh token | HttpOnly, SameSite=strict cookie only | cookie **and** JSON body (`refreshToken`) |
| Refresh request | cookie | body `{ "refreshToken": "…" }` (a body token is ignored unless the header is present) |
| Session length | 7 days | 30 days, rolling: re-extended on every refresh |
| Rotation | every refresh issues a new token and deletes the old one | same |
| Revocation | `POST /api/auth/logout`, deactivated account | same |

The Capacitor WebView runs on `https://localhost`, a different site from the API, so the browser engine never stores the strict cookie. That is why the app keeps the refresh token itself (`src/services/sessionTokens.ts`). The body token is only ever returned to a client that sent `X-Client: native-app`; browsers never get it in a response body. Access-token lifetime is independent of the 7/30-day refresh session.

Implementation: `rnd-service/src/utils/sessionPolicy.ts`, `controllers/auth.controller.ts` (`login`, `refresh`, `logout`).

## 3. Parent password-change OTP

Behaviour found before the change: the parent profile UI (web **and** mobile) called `POST /api/parent/profile/send-password-otp`, which did not exist, and `POST /api/auth/change-password` ignored `otpCode`. The OTP step could therefore never succeed. (The teacher OTP step was removed server-side in `353eef1` because the forced first-login password page never sent a code; `POST /api/teachers/me/send-password-otp` still exists but its code is not verified. This was left unchanged.)

Now (parents only):

1. `POST /api/parent/profile/send-password-otp` (parent JWT) generates a 6-digit code (`crypto.randomInt`) and sends it through the approved `auth.otp` WhatsApp template to the parent's registered number. The code is never returned or logged.
2. The code is stored in `PasswordChangeOTP`, bound to the user and purpose `parent-password-change`, HMAC-SHA256 hashed, valid 5 minutes, one live code per user (a new one replaces it).
3. Limits: 60 s resend cooldown (`429` + `Retry-After`), 5 sends per hour per account, 5 verification attempts per code (then the code is dead and a new one must be requested).
4. `POST /api/auth/change-password` with `{ currentPassword, newPassword, otpCode }`: the current password is checked first (a wrong password does not consume an attempt), then the code is verified with a constant-time compare and consumed by an atomic delete, so it can be used once even under concurrent requests.
5. Not affected: admins/teachers/other roles, and parents on the forced first-login change (`mustChangePassword`), which stay current-password-only.
6. If WhatsApp cannot queue the message the code is discarded and the API returns `503`, so the UI does not advance to the OTP step.

The web and mobile UIs already send this contract; no `rnd-ui` change was needed.

Files: `models/passwordChangeOTP.model.ts`, `services/passwordChangeOtp.service.ts`, `routes/parent/profile.routes.ts`, `controllers/auth.controller.ts`; tests in `routes/parent/__tests__/passwordOtp.routes.test.ts`.

## 4. App updates

Full design: [`app-ui/docs/APP_UPDATES.md`](../app-ui/docs/APP_UPDATES.md). Lifecycle:

1. CI (or a superadmin) builds and signs a release (`scripts/release/release-tool.mjs`), uploads the artifact to S3 under `releases/`, and registers the signed manifest with `POST /api/app-updates/admin/releases` (CI token or superadmin JWT).
2. The backend verifies the manifest signature against `APP_RELEASE_PUBLIC_KEY` and the S3 object checksum, and stores an `AppRelease` document (draft).
3. `POST …/publish` (optionally with a rollout %) makes it available; `…/pause` and `…/revoke` withdraw it.
4. The app calls the public `GET /api/app-updates/android`; the backend returns the compatible release(s) as signed manifests with a 15-minute presigned S3 URL.
5. The app downloads, verifies the signature/checksum against the public key compiled into it (`release/keys/release-signing-public.pem`) and installs: a web bundle via `@capgo/capacitor-updater`, an APK via the Android installer (`ApkUpdaterPlugin`).
6. Lifecycle telemetry goes to `POST /api/app-updates/events` (no personal data).

Backend files: `routes/shared/appUpdates.routes.ts`, `services/appRelease.service.ts`, `models/appRelease.model.ts`, `models/appUpdateEvent.model.ts`; mounted at `/api/app-updates` in `server.ts`.

**Not exercised here:** publishing a real release and installing it on a device (needs the private signing key, AWS credentials and a device). Route and service logic is covered by the automated tests below.

## 5. Holiday calendar

The holiday-calendar backend from ERP-APP commit `1aa4400` was already in production, identical to that commit (`models/academicCalendar.model.ts`, `routes/admin/calendar.routes.ts`, `services/calendar.service.ts`, mounted at `/api/calendar`; attendance register filtering in `routes/teacher/attendance.routes.ts` and `services/reportCard.service.ts`). Nothing was ported. Integration tests were added.

- `GET /api/calendar/holidays?month=YYYY-MM|year=YYYY` needs `attendance:view`; `POST/DELETE /api/calendar/holidays` and `POST /api/calendar/override-sunday` need `attendance:mark`.
- Sundays are non-working unless overridden (school-wide or per class). Holidays/vacations (school-wide or per class) are excluded from attendance percentages and report cards, server-side, so parent/teacher screens in both apps reflect them automatically.
- The management UI is in `AdminAttendance` in both `rnd-ui` and `app-ui`.

## 6. Environment configuration

### Backend (`rnd-service/.env`, passed through `docker-compose.yml`)

Existing variables are unchanged. New:

| Variable | Purpose |
|---|---|
| `CORS_ALLOWED_ORIGINS` | must now also include **`https://localhost`** (the Capacitor WebView origin) |
| `APP_RELEASE_PUBLIC_KEY` | PEM public half of the release-signing key (`\n`-escaped is fine) |
| `APP_RELEASE_CI_TOKEN` | shared secret for CI → `/api/app-updates/admin/*` |
| `APP_RELEASE_PACKAGE_ID` | optional, default `com.schoolhub.app` |

The OTP feature needs the existing WhatsApp configuration and the approved `o_auth` template. App updates need the existing `AWS_*` S3 settings (read access to `releases/*`).

### Mobile (`app-ui/.env.production`, committed; contains no secrets)

```
VITE_API_URL=https://18-61-239-173.sslip.io/api
```

`VITE_API_URL` is required for native builds. There is no hardcoded fallback; a build without it logs an error and API calls fail. The runtime "custom server URL" override is honoured only in dev builds. Cleartext HTTP and mixed content are off by default: they are enabled only by `scripts/release/local-release.mjs` (local Wi-Fi test builds: `CAPACITOR_LOCAL_HTTP=1` and `-PallowHttpUpdates=true`).

Android signing secrets are never in the repo: `ANDROID_KEYSTORE_FILE|PASSWORD`, `ANDROID_KEY_ALIAS|PASSWORD` (or `ANDROID_KEYSTORE_PROPERTIES` pointing outside the repo). Without them release builds are unsigned.

## 7. Database

No manual migration. Mongoose creates these collections and indexes on first use/startup:

| Collection | Notes |
|---|---|
| `appreleases`, `appupdateevents` | app updates |
| `passwordchangeotps` | unique index `{userId, purpose}`, TTL index on `expiresAt` |

If `autoIndex` is disabled in production, create the indexes once (e.g. `PasswordChangeOTP.syncIndexes()`); without the TTL index expired codes are still rejected by the code but are not purged.

## 8. Android build

Prerequisites: Node 22, JDK 21, Android SDK (API 36). `ANDROID_HOME` must point at the SDK.

```bash
cd app-ui
npm ci
npm run build          # uses .env.production → VITE_API_URL
npx cap sync android
cd android
./gradlew assembleDebug      # android/app/build/outputs/apk/debug/app-debug.apk
```

Release APKs (signed) and web live-updates are produced by `scripts/release/*` and the workflows described in `app-ui/docs/APP_UPDATES.md`. Bump `android/app/version.properties` for every native release. `appId` (`com.schoolhub.app`) and the keystore must never change, or installed apps cannot be updated.

## 9. Deployment order

1. Deploy `rnd-service` first (auth change is backward compatible; app-update routes and OTP are additive).
2. Add `https://localhost` to `CORS_ALLOWED_ORIGINS`; add the `APP_RELEASE_*` values before publishing the first release.
3. Web (`rnd-ui`) needs no redeploy for this work.
4. Build and distribute the APK.

## 10. Feature reconciliation (`app-ui` vs production `rnd-ui`)

`app-ui` is the latest ERP-APP UI working tree. Its web code forked from production at `5672cb9`; production `rnd-ui` changes since then were three-way merged into it:

| Production change | In `app-ui` |
|---|---|
| Event media: direct-to-S3 presigned upload with progress (`d2bef56`, `1b96ecf`, `fe35e60`) | merged |
| Fee receipt: WhatsApp dispatch, local QR code (`b20c71b`, `1526675`) | merged |
| Marks: persist grades before report cards; approved template (`3e761b9`) | merged |
| School-profile save error handling (`51be46f`) | merged |
| Bulk/individual fee-category reminders; transport alerts (`a79d95e`, `e805749`) | merged |
| WhatsApp usage/insights, credential delivery flows, SuperAdmin portal changes (`fb1186c`) | merged |
| Removal of the one-off WhatsApp `MessageComposer` (`fb1186c`) | applied (files and modals removed) |
| Backend-only items: login rate limiting, trust proxy, `publicOrigin`, retry utils, transport alert/insights services | live in the shared backend; no UI work needed |

ERP-APP backend items **not** ported: its diverged fee-reminder/notification-job/public-event/WhatsApp-template changes (production already has newer versions) and anything not required by the mobile app.

## 11. Known issues

- `app-ui` and `rnd-ui` both have pre-existing TypeScript errors under `tsc` (107 in `app-ui`, unchanged by the merge); both build with Vite, which does not type-check.
- Teacher profile still shows an OTP step whose code the server does not verify (pre-existing, product decision needed).
- `app-ui/docs/APP_UPDATES.md` still refers to the old `rnd-ui` repo layout and to plain-HTTP production; the API is now served over HTTPS.
- Capacitor `cleartext`/`allowMixedContent` are baked in at `cap sync` time: run `cap sync` with the right `CAPACITOR_LOCAL_HTTP` for the build type.
