# Mobile App: Deployment and Integration Guide

How to build, deploy and run the Android app (`app-ui`) against the shared backend (`rnd-service`), so every service (WhatsApp messages, OTP, fees, attendance, S3 uploads, app updates) works from the phone exactly as it does from the web UI (`rnd-ui`).

```
sai-ram/
├── rnd-service/   Backend (Express + MongoDB + Redis + BullMQ worker). Shared by web and mobile.
├── rnd-ui/        Web UI
└── app-ui/        Mobile UI (React + Capacitor, Android)
```

## 1. How it fits together

```
 Phone (app-ui APK)  ──HTTP(S)──►  rnd-service API  ──►  MongoDB
 (WebView https://localhost)           │   ▲
                                       │   └── Redis ◄── Worker (BullMQ)
                                       │                    │
                                       │                    └──► WhatsApp Cloud API (Meta)
                                       └──► AWS S3 (uploads, receipts, app releases)
```

**Key point: the app contains no business logic of its own.** WhatsApp messages, OTPs, fee receipts and reminders are all sent by the *backend*. The app only calls the API. So "WhatsApp works from mobile" means: the backend is reachable from the phone **and** the backend's WhatsApp setup, Redis and worker are running.

Requirements for all services to work:

| Service | What must be running / configured |
|---|---|
| Login, data screens | API + MongoDB |
| WhatsApp (receipts, reminders, credentials, OTP) | API + **Redis** + **Worker** + all `WHATSAPP_*` env vars |
| Parent password-change OTP | Same as WhatsApp (approved `auth.otp` template) |
| Uploads (event media, documents) | `AWS_*` env vars (S3) |
| In-app updates | `APP_RELEASE_*` env vars + S3 read on `releases/*` |

## 2. Prerequisites

- Node 22, JDK 21, Android SDK (API 36); set `ANDROID_HOME` (Windows: `%LOCALAPPDATA%\Android\Sdk`)
- Docker (for Redis and production deploy)
- A release keystore and update-signing key. They live **outside** the repo, in `%USERPROFILE%\.schoolhub-release\` (`schoolhub-release.jks`, `keystore.properties`, `release-signing-private.pem`, `release-signing-public.pem`). Never commit them.

## 3. Backend setup (do this first)

Copy `rnd-service/.env.example` to `rnd-service/.env` and fill in:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_HOST`, `REDIS_PORT` | Redis is **required** (caching, login rate limit, WhatsApp queue) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long random strings (server refuses to start in production otherwise) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME` | S3 |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp Cloud API. Leave **all** unset for simulation mode (messages only logged); a partial set is a startup error |
| **`CORS_ALLOWED_ORIGINS`** | **Must include `https://localhost`**, the origin of the Capacitor WebView. Without it every mobile API call fails. Comma-separate with the web origin, e.g. `https://erp.example.com,https://localhost` |
| `APP_RELEASE_PUBLIC_KEY`, `APP_RELEASE_CI_TOKEN` | Only needed for in-app updates |

Run it (**API and worker are two separate processes. WhatsApp needs both**):

```bash
cd rnd-service
npm ci
# Development
npm run dev            # API on PORT (default 5000)
npm run dev:worker     # worker (sends queued WhatsApp messages)
# Production
npm run build
npm start              # API
npm run start:worker   # worker
```

Production with Docker: `docker compose up -d --build` (the compose file runs API + worker via PM2, plus Redis and nginx).

Check the log for: `[Redis] Connected successfully`, `MongoDB Connected Successfully`, `Server is running on port …`, and `[WhatsApp Self-Test] PASSED`.

## 4. Build the Android app

The API URL is baked into the app at build time (`VITE_API_URL`, must end in `/api`). There is no fallback.

### A. Production build (HTTPS server)

1. Set `app-ui/.env.production`:
   ```
   VITE_API_URL=https://<your-domain>/api
   ```
   (Currently `https://18-61-239-173.sslip.io/api`.)
2. Build and sync:
   ```bash
   cd app-ui
   npm ci
   npm run build
   npx cap sync android
   ```
3. Build the APK:
   ```bash
   cd android
   ./gradlew assembleRelease        # signed if keystore env vars are set
   ```
   Signing is read from `ANDROID_KEYSTORE_PROPERTIES` (path to `keystore.properties`) or `ANDROID_KEYSTORE_FILE|PASSWORD`, `ANDROID_KEY_ALIAS|PASSWORD`. Output: `android/app/build/outputs/apk/release/app-release.apk`.

   Debug APK (quick test): `./gradlew assembleDebug`.

### B. Local Wi-Fi testing (backend on your PC, phone on the same Wi-Fi)

One command builds a signed APK that talks to your PC over plain HTTP:

```bash
cd app-ui
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"      # PowerShell: $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
node scripts/release/local-release.mjs base --ip <PC-WIFI-IP> --api-port 5000
```

- Find the PC's IP with `ipconfig` (the Wi-Fi adapter's IPv4).
- Output: `SchoolHub-local-v<N>.apk` in the repo root. Copy it to the phone and install it (allow "install unknown apps"; uninstall first if a differently-signed copy is installed).
- Plain HTTP is enabled only for these local builds (`CAPACITOR_LOCAL_HTTP=1`). Production builds are HTTPS-only.
- If the PC's IP changes, rebuild the APK.

For local testing the backend also needs:
1. Redis running (e.g. `docker run -d --name erp-redis -p 6379:6379 redis:7-alpine`)
2. `CORS_ALLOWED_ORIGINS=https://localhost` in `rnd-service/.env`
3. API **and** worker running (section 3)
4. Windows firewall open for the API port (admin PowerShell):
   `New-NetFirewallRule -DisplayName "School ERP API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow`
5. Phone on the same Wi-Fi. Quick check: open `http://<PC-IP>:5000/api` in the phone browser (a JSON/404 reply means it's reachable).

## 5. Distribute and update

- **First install:** share the signed APK (direct file, internal link, or Play Store upload).
- **Web-only changes (UI):** publish a live update, no reinstall: `node scripts/release/local-release.mjs web` (local), or the `release-web` workflow (production). On the phone: Settings → App Updates → Check for updates → Update now → Restart & apply.
- **Native changes:** bump `android/app/version.properties` and publish a new APK (`local-release.mjs native` or `release-android` workflow).
- Production releases need the S3 + `APP_RELEASE_*` backend config and the signing key; see `app-ui/docs/APP_UPDATES.md`.
- `appId` is `com.schoolhub.app`. Never change it, or Android treats it as a different app.

## 6. Login and sessions (mobile vs web)

The app sends `X-Client: native-app` on every request. Because the app runs on `https://localhost` (a different site from the API), the browser cookie isn't stored, so the app keeps the refresh token itself. Access tokens are short-lived; mobile sessions last 30 days (rolling); web sessions 7 days. Logout or deactivating the account revokes the session. Details: `docs/MOBILE_INTEGRATION.md` section 2.

## 7. Verifying that all services work from the phone

| Test | Expected |
|---|---|
| Log in as admin / teacher / parent | Dashboard loads |
| Parent → Profile → change password | WhatsApp message with a 6-digit code arrives on the parent's number; password changes after entering it |
| Collect a fee / generate a receipt | Receipt WhatsApp message sent to the parent |
| Send fee reminder / transport alert | Messages appear in the WhatsApp usage/insights screen and arrive on the phone |
| Upload event media / documents | Upload succeeds (S3) |
| Settings → App Updates | Check for updates works |

If a WhatsApp message doesn't arrive, check in this order: worker running; Redis connected; `[WhatsApp Self-Test] PASSED` at startup; recipient number valid; the template approved in Meta; 24-hour window rules (the fallback template covers closed windows).

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App shows network error / can't log in | Wrong `VITE_API_URL` baked in (rebuild); backend not reachable (firewall, different Wi-Fi); `https://localhost` missing from `CORS_ALLOWED_ORIGINS` |
| Works in browser but not in app | CORS, or an HTTP URL in a production build (production allows HTTPS only) |
| WhatsApp messages never arrive | Worker not running, Redis down, or WhatsApp env vars missing (simulation mode only logs) |
| Backend won't start | Redis not running, or `JWT_*` secrets missing in production |
| `SDK location not found` while building | Set `ANDROID_HOME` |
| APK won't install over old app | Old app was signed with a different key: uninstall it first |
| Phone can't reach PC | Firewall rule missing, or PC IP changed |

## 9. Deployment order (production)

1. Deploy `rnd-service` (API + worker + Redis); add `https://localhost` to `CORS_ALLOWED_ORIGINS`; add `APP_RELEASE_*` before the first app release.
2. `rnd-ui` needs no redeploy for mobile.
3. Set `VITE_API_URL` to the production HTTPS API, build the signed APK, distribute it.
4. Run the checks in section 7 on a real phone.

More detail: `docs/MOBILE_INTEGRATION.md`, `app-ui/docs/APP_UPDATES.md`.
