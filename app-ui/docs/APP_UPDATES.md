# Android App Updates

How installed SchoolHub/EduTrack Android apps receive updates without going through an app store, and how to publish one.

There are two update channels:

| | **Live update** (web bundle) | **Native update** (APK) |
|---|---|---|
| Use for | React/TS/CSS/HTML changes only | Java code, Capacitor plugins, permissions, `AndroidManifest.xml`, `capacitor.config.ts`, the release key |
| User experience | Settings → *Update now* → *Restart & apply* (a few seconds, no reinstall) | Settings → *Update now* → Android's installer → *Update* |
| Workflow | **Release - Web live update** | **Release - Android APK** |
| Version change | none (bundle ID `web-<timestamp>-<sha>`) | bump `android/app/version.properties` |

If you are unsure which one you need, run `git diff --stat <last-native-tag> -- android capacitor.config.ts package.json`. Any change under `android/`, to `capacitor.config.ts`, or to a `@capacitor/*` / `@capgo/*` dependency needs a **native** release.

---

## 1. Architecture

```
 GitHub Actions (manual, approved)                Oracle VM (existing backend)            Phone
 ─────────────────────────────────                ────────────────────────────            ─────
 build → test → sign (release key, keystore)
   │
   ├─ upload artifact ──────────────► S3  releases/…   (immutable, SHA-256 checked)
   │                                    ▲
   └─ register signed manifest ──► POST /api/app-updates/admin/releases
                                     │  verifies signature + S3 checksum
      publish / pause / rollout ───► POST …/publish|pause|revoke
                                                        GET /api/app-updates/android ◄── Settings check
                                                        (signed manifest + 15-min presigned URL)
                                                                                   download from S3
                                                                                   verify → apply
                                                        POST /api/app-updates/events ◄── telemetry
```

**Trust model.** The private release-signing key exists only in GitHub Actions secrets (and the offline backup). It signs:

1. every **release manifest** (RSASSA-PKCS1-v1_5/SHA-256); the backend refuses to register an unsigned or altered one, and the app verifies it again (`src/services/appUpdates/manifest.ts`).
2. every **live bundle**: the bundle is AES-encrypted, and its SHA-256 and AES key are RSA-signed (Capgo "encryption v2"). The native updater plugin holds the public key and **rejects any bundle not produced by the release key**, independently of the server.

A compromised API server can therefore withhold updates but cannot push code to devices. APKs are additionally protected by Android itself: an update must be signed with the same certificate as the installed app.

**Components**

| Piece | Where |
|---|---|
| Update API, models, selection rules | `rnd-service/src/routes/shared/appUpdates.routes.ts`, `src/services/appRelease.service.ts`, `src/models/appRelease.model.ts`, `src/models/appUpdateEvent.model.ts` |
| Live-update plugin | `@capgo/capacitor-updater` 8.52.1 (pinned), manual mode, configured in `capacitor.config.ts`; no data is sent to Capgo (`updateUrl`/`statsUrl`/`channelUrl` empty) |
| APK installer plugin | `android/app/src/main/java/com/schoolhub/app/ApkUpdaterPlugin.java` (registered in `MainActivity.java`) |
| App logic | `src/services/appUpdates/*`, `src/hooks/useAppUpdates.ts` |
| UI | `src/components/shared/AppUpdates/AppUpdates.tsx` (Admin → Profile, Teacher → Profile, Parent → My Account), `AppUpdateBanner.tsx` (global, non-blocking) |
| Release tool | `scripts/release/release-tool.mjs` |
| CI | `.github/workflows/release-web.yml`, `release-android.yml`, `manage-release.yml` |

---

## 2. Backend API

All under `/api/app-updates`. Public endpoints are rate-limited (120/min/IP) and need no login, so the app can check before sign-in.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /android?channel=production&versionCode=2&bundleId=builtin&installId=<uuid>` | public | Returns `{ checkedAt, mandatory, native, liveUpdate }`; each offer is `{ releaseId, manifest, signature, keyId, downloadUrl }` or `null` |
| `GET /releases/:releaseId` | public | Signed manifest of a **published** release |
| `POST /events` | public | `{ installId, kind, stage, releaseId?, versionCode?, bundleId?, channel?, error? }`; stages: `check, download_started, download_failed, verify_failed, ready, activated, rollback, apk_install_launched, apk_installed, apk_cancelled, failed`. Kept 90 days. |
| `GET /admin/releases?channel=&kind=` | CI token or superadmin | Releases + per-stage event counts |
| `POST /admin/releases` | CI token or superadmin | Register `{ manifest, signature, keyId }` as a **draft** |
| `POST /admin/releases/:id/publish` | CI token or superadmin | `{ rolloutPercent: 1-100, promote?: true }`: publish, change rollout, or re-promote |
| `POST /admin/releases/:id/pause` | CI token or superadmin | Stop offering it |
| `POST /admin/releases/:id/revoke` | CI token or superadmin | Permanently withdraw it (cannot be re-published) |

CI authenticates with header `X-Release-Token`. Humans use a **superadmin** JWT; no other role can manage releases.

**Registration checks** (all must pass, otherwise nothing is stored): signature valid for `APP_RELEASE_PUBLIC_KEY` and `keyId` matches; schema valid; `packageId` is `com.schoolhub.app`; release ID unused (IDs are immutable); a native `versionCode` greater than every registered one in that channel; the S3 object exists with **exactly** the manifest's size and SHA-256.

**Selection rules** (`appRelease.service.ts`, unit-tested):

- **Native:** the highest published `versionCode` greater than the device's, within its rollout cohort. If the device is below the highest `minimumSupportedVersionCode`, the update is **mandatory** and the rollout cohort is ignored. Never offers a downgrade.
- **Live:** the most recently *promoted* published web release whose `compatibleNativeMin ≤ device versionCode ≤ compatibleNativeMax`, within the cohort; nothing if the device already runs it. Re-promoting an older release makes it the target again (this is fleet-wide rollback).
- **Cohorts:** `sha256(releaseId:installId) mod 100 < rolloutPercent`. Deterministic, so raising the percentage only adds devices.

### Manifest schema (v1)

The release tool produces the manifest and the backend stores the signed bytes verbatim. Download URLs are *not* in the manifest; integrity is bound by the hashes.

```jsonc
{
  "schemaVersion": 1,
  "releaseId": "android-1.2.0-3",          // or "web-20261018093000-abc1234"
  "kind": "native",                         // "native" | "web"
  "channel": "production",                  // "staging" | "production"
  "packageId": "com.schoolhub.app",
  "createdAt": "2026-10-18T09:30:00.000Z",
  "releaseNotes": ["Improved attendance screens"],
  "native": {                               // kind = native only
    "versionName": "1.2.0", "versionCode": 3, "minimumSupportedVersionCode": 2, "mandatory": false,
    "artifactKey": "releases/android/android-1.2.0-3/app-release.apk",
    "sha256": "<apk sha256 hex>", "size": 5273353,
    "signingCertSha256": "4f676eb2c29ee84a2fbd6c1764cf7919a84e62fbff5ed02a29cb3555d1942dae"
  },
  "web": {                                  // kind = web only
    "bundleId": "<same as releaseId>", "compatibleNativeMin": 2, "compatibleNativeMax": 2,
    "artifactKey": "releases/web/<id>/bundle.zip.enc",
    "artifactSha256": "<sha256 of the encrypted file>", "size": 747888,
    "checksum": "<RSA-signed sha256 of the plain zip, 512 hex>",
    "sessionKey": "<base64 iv>:<base64 RSA-signed AES key>"
  }
}
```

---

## 3. Device behaviour

**Live bundle:** Settings check → manifest signature and compatibility checked in JS → *Update now* → the plugin downloads to its staging area and verifies the signed checksum natively (a corrupted or forged bundle is discarded) → *Restart & apply* (`set`, reloads now) or *Apply on next launch* (`next`).

On the next start, `initAppUpdates()` (in `main.tsx`) calls `notifyAppReady()` **first**. If a new bundle doesn't reach that call within 15 s, the plugin restores the previous bundle automatically. The app then compares the running bundle with the pending one and reports **activated** or **rollback**; the user sees *Update completed* or *Recovered previous version*. The app keeps the current bundle plus the previous known-good one and deletes older ones. The built-in bundle inside the APK is always available as the final fallback.

**APK:** *Update now* → `ApkUpdaterPlugin.download` streams over HTTPS into app-private cache, then checks SHA-256 = manifest, package = `com.schoolhub.app`, versionCode = manifest and > installed, and signing certificate = installed app's = manifest's. Any mismatch deletes the file and shows the reason → *Install update* (asks once for "Install unknown apps" permission if needed) → Android's installer.

- **Cancel:** the app resumes unchanged and shows *Install again*, keeping the verified file.
- **Success:** Android restarts the app with all data and logins kept. The new version is detected and reported, and temporary files are removed.

No silent installs, no downgrades, no data deletion.

**Background check:** 8 s after launch, at most every 6 h, with exponential backoff after failures (15 min doubling to 24 h). It shows a small dismissible banner. Optional updates can be postponed for 3 days. Mandatory ones stay visible but **never block** ERP features. Every failure is caught; the update system cannot break login, attendance or fees.

**Telemetry:** a random per-install UUID, never linked to a user, plus release ID, stage and version. No names, phone numbers, student data or tokens.

---

## 4. Keys and secrets

Generated on 2026-10-18 and stored on the release manager's PC in `C:\Users\dell\.schoolhub-release\` (only that Windows user can read it):

| File | What | Where it must also go |
|---|---|---|
| `schoolhub-release.jks` + `keystore.properties` | APK signing keystore (RSA-4096, valid to 2054, alias `schoolhub`). Cert SHA-256 `4f676eb2…942dae` | GitHub secret `ANDROID_KEYSTORE_BASE64` (`base64 -w0 schoolhub-release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| `release-signing-private.pem` | RSA-2048 release-signing key (bundles + manifests) | GitHub secret `RELEASE_SIGNING_PRIVATE_KEY` |
| `release-signing-public.pem` | Its public half (key ID `7ec4427f4381580c`) | committed as `release/keys/release-signing-public.pem` and in `src/services/appUpdates/releaseKey.ts`; backend env `APP_RELEASE_PUBLIC_KEY` |
| `ci-release-token.txt` | Shared secret for CI → API | GitHub secret `APP_RELEASE_CI_TOKEN`; backend env `APP_RELEASE_CI_TOKEN` |

> **Back up the whole folder now** to two offline places (for example an encrypted USB drive plus a password manager). **If the keystore is lost, no installed app can ever be updated again**: every user would have to uninstall (losing local app data) and reinstall. Never commit these files, paste them in chat, or put them in the app.

**Rotating the release-signing key:** it is compiled into the app, so it needs a native release.
1. Generate a new key and put its public half in `release/keys/` and `releaseKey.ts`.
2. Publish a native release still signed for the old key ID.
3. Switch `RELEASE_SIGNING_PRIVATE_KEY` and `APP_RELEASE_PUBLIC_KEY` once that release has reached your devices.

The APK keystore cannot be rotated in place without Android's key-rotation (APK Signature Scheme v3) tooling; treat it as permanent.

---

## 5. One-time setup

### 5.1 Backend (rnd-service)
1. Deploy the `feature/app-updates` backend **before** any app release (Phase 7 rule: backend first). The new collections (`appreleases`, `appupdateevents`) are created automatically; no migration is needed.
2. Add to the production `.env` / `docker-compose` environment:
   ```
   APP_RELEASE_PUBLIC_KEY="-----BEGIN RSA PUBLIC KEY-----\n…\n-----END RSA PUBLIC KEY-----"   # \n-escaped is fine
   APP_RELEASE_CI_TOKEN=<contents of ci-release-token.txt>
   # optional: APP_RELEASE_PACKAGE_ID=com.schoolhub.app
   ```
   and pass them through in `docker-compose.yml` like the other variables.

### 5.2 S3
Use the existing bucket with the `releases/` prefix. Create a **separate IAM user for CI** that can only write releases:
```json
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"], "Resource": "arn:aws:s3:::<bucket>/releases/*" }
]}
```
The backend's existing credentials only need `s3:GetObject` on `releases/*` (presigning and HeadObject). CI uploads with `If-None-Match: *`, so a published artifact can never be overwritten. Optionally enable S3 Versioning or Object Lock on the bucket for extra protection.

### 5.3 GitHub (rnd-ui repo → Settings)
- **Environments:** create `staging` and `production`. On `production` add **Required reviewers** and restrict deployment branches to `main` (or your release branch).
- **Environment secrets (both):** `RELEASE_SIGNING_PRIVATE_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `RELEASE_AWS_ACCESS_KEY_ID`, `RELEASE_AWS_SECRET_ACCESS_KEY`, `APP_RELEASE_CI_TOKEN`.
- **Environment variables:** `RELEASE_API_BASE` (for example `https://api.example.com/api`), `VITE_API_URL` (the API URL baked into the app, usually the same), `RELEASE_BUCKET`, `RELEASE_AWS_REGION` (`ap-south-2`), `EXPECTED_SIGNING_CERT_SHA256` = `4f676eb2c29ee84a2fbd6c1764cf7919a84e62fbff5ed02a29cb3555d1942dae`.

The existing `build-apk.yml` (debug APK on every push) is unchanged and is not a release.

### 5.4 HTTPS (required before production)
Production currently answers on plain `http://140.245.225.16`. Apps should check for updates and talk to the API over HTTPS.
1. Point a DNS name (for example `api.<school-domain>`) at the VM.
2. On the VM: `sudo certbot certonly --standalone -d api.<domain>`, stopping nginx briefly, or use the webroot method. Copy or link `fullchain.pem` and `privkey.pem` into `rnd-service/nginx/certs/`.
3. In `rnd-service/nginx/nginx.conf`, uncomment the existing `listen 443 ssl` server block, set `server_name`, and make the port-80 block `return 301 https://$host$request_uri;`.
4. Open port 443 in the OCI security list and the VM firewall, then `docker compose up -d nginx`.
5. Set `VITE_API_URL` / `RELEASE_API_BASE` to `https://api.<domain>/api` and ship a **native** release, so the API URL baked into the app changes.
6. Add a cron job for `certbot renew` with an nginx reload.

Until then, signatures still protect update integrity, but logins and data travel unencrypted.

### 5.5 Bootstrap release (once)
Phones running the old debug-signed APK cannot be updated in place: the signing key differs. Android will refuse, and the app says so. One manual reinstall is required:

1. Run **Release - Android APK** for `production` with versionCode 2 (already set) and rollout 100.
2. Download the APK from the workflow artifacts, or from the release in S3, and share it (WhatsApp, link, USB).
3. Each user uninstalls the old EduTrack app once, then installs the new APK. Logins need re-entering, but all school data lives on the server.

Every later update goes through Settings → App Updates.

---

## 6. Publishing an update (step by step)

### Frontend-only change (most changes)
1. Make the change and open a PR. Wait for CI and review, then merge to `main`.
2. Deploy any backend change it depends on **first** (see §7).
3. GitHub → Actions → **Release - Web live update** → *Run workflow*:
   - `channel: staging`, notes such as `Fixed fee receipt totals|Faster attendance load`, rollout `100`.
4. Test on a staging phone: Settings → App Updates → *Update now* → *Restart & apply*. Confirm the app works.
5. Run it again with `channel: production`. A reviewer approves the `production` environment.
   - For a cautious rollout, start at `10`. Then use **Release - Manage rollout** → `publish`, same release ID, `100`.

### Native change
1. Bump `android/app/version.properties`: `VERSION_CODE` +1, plus `VERSION_NAME`. Merge to `main`.
2. **Release - Android APK** with `channel: staging`. Install it on a test phone through Settings → App Updates → *Install update*.
3. Run it again for `production` and get approval.
   - If old versions must stop working, set `minimum_supported_version_code` and/or `mandatory`. They then get a non-dismissable (but non-blocking) prompt.
4. After a native release, web bundles target the new versionCode by default. Older APKs keep their compatible bundles until they update. To also ship a web fix to older APKs, run the web release with `native_min` set to the oldest compatible versionCode. **Only** do that if the web change doesn't need the new native code.

### What the workflows do
Install → `npm test` → `typecheck:updates` → `lint:updates` → build → (native: signed `assembleRelease`, `apksigner` cert check, `aapt2` package/version check) → sign and verify with the release tool (the web release proves the CI key matches the key compiled into the app) → immutable S3 upload with SHA-256 → re-download and hash check → register (the server re-verifies signature and S3 checksum) → publish → confirm the release is live.

Any failed step stops the release before anything is offered to devices.

---

## 7. Coordinating backend, web and native releases

1. **Backend first, backward compatible.** Add fields and endpoints, never remove or rename ones that installed apps (any versionCode still supported) use. Use expand → migrate → contract: add the new field, deploy apps that use it, wait until old apps are unsupported (`minimumSupportedVersionCode`), then remove the old one.
2. **Then web bundles, then native.** A web bundle must only call APIs the backend already serves.
3. **No data migrations in the client.** Database changes run on the backend (deploy or scripts), never during bundle activation.
4. Apps keep working on old bundles indefinitely if the update server is down. Updates are additive, not required for operation, unless you set a minimum supported version.

---

## 8. Rollback and recovery

| Situation | Action |
|---|---|
| Bad web bundle, devices still starting | **Manage rollout** → `publish` the last good web release ID. It becomes the target and devices move back to it on their next check. Then `pause` or `revoke` the bad one. |
| Bad web bundle that crashes on start | Automatic: the plugin restores the previous bundle when `notifyAppReady()` isn't reached within 15 s, and the app reports `rollback`. Then do the row above so it isn't offered again. |
| Pause a rollout | **Manage rollout** → `pause`. Devices that already applied it keep it. |
| Bad APK | APKs cannot be downgraded. `pause` or `revoke` it, then ship a fixed **higher** versionCode (optionally mandatory). |
| Device stuck or corrupted | The built-in bundle in the APK always remains. Reinstalling the same APK over the top keeps data. |
| Server/API down | Apps keep running their current bundle; update checks fail quietly with backoff. |

Inspect status and telemetry: **Manage rollout** → `list`. This shows each release with counts per stage (`activated`, `rollback`, `verify_failed`, …).

---

## 9. Tests

| Suite | Command | Result (2026-10-18) |
|---|---|---|
| Backend unit: signatures, schema, cohorts, selection | `rnd-service: npm test` | 35 new tests pass; whole suite **115 passed, 12 skipped** (80 existed before) |
| Backend integration (routes + real MongoDB, S3 mocked) | `TEST_MONGODB_URI=mongodb://127.0.0.1:27018/app-updates-test npm test`. **Throwaway DB only, it is dropped.** | **12 / 12 pass**; full suite with DB **127 / 127** |
| Frontend: manifest verification, offer validation, state machine, policies | `rnd-ui: npm test` | 29 tests pass |
| Release tool end-to-end (encrypt/sign/verify, tamper detection) | `rnd-ui: npm test` | 7 tests pass (36 total in rnd-ui) |
| Type check (update code, strict) / lint | `npm run typecheck:updates`, `npm run lint:updates` | clean |
| Native compile | `./gradlew assembleDebug`, `assembleRelease` with keystore | both succeed; release APK verified with `apksigner` (cert `4f676eb2…`) and `aapt2` (`com.schoolhub.app`, code 2, 1.1.0) |

Acceptance scenarios covered by the automated tests above: 1, 2 (detection logic), 5 and 6 (tamper and wrong key), 8, 13 (request failures fall through), 14, 15 (missing or mismatched artifact refused), 16 (pause and re-promote).

**Not yet executed. They need a real phone and a deployed backend plus S3 staging:**
- 3, 4: live bundle activation and surviving a restart.
- 7: crash rollback on a device.
- 9–12: installer flow, cancel, in-place update keeps data, mismatched signature on a device.
- 17: ERP regression.

Record those results here when you run them.

**Known pre-existing issues (not from this work):**
- `npm run lint` reports 2 errors: `rules-of-hooks` in `ParentDashboard.tsx:313` and `ParentProfile.tsx:40`.
- `tsc -p tsconfig.app.json` reports 134 errors.

That is why CI gates on the scoped `typecheck:updates` and `lint:updates`.

---

## 10. Limitations
- No in-app admin screen for releases yet. Management is through the **Manage rollout** workflow or the superadmin API.
- Download size: live updates send the whole bundle (~0.75 MB zipped), not deltas.
- Android 7 and earlier (API < 26) have no per-app install permission. The installer still asks the user to confirm.
- HTTPS is not yet configured in production (§5.4).
