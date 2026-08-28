# WhatsApp Messaging System — Production Audit & Remediation Report

**Date:** 2026-07-15 · **Scope:** entire WhatsApp Cloud API integration (send pipeline, webhooks, configuration, persistence, health, tests)
**Verified live:** test message delivered to 8899582239 (wamid returned, lifecycle recorded in MongoDB), server boot self-test PASSED, 54/54 automated tests pass, full `tsc` build clean.

---

## 1. Issues found

| # | Severity | Issue |
|---|----------|-------|
| 1 | High | Webhook accepted **any** POST — no `X-Hub-Signature-256` verification, so anyone who discovered the URL could forge events. |
| 2 | High | Webhook verify endpoint had a **hardcoded fallback token** (`school_erp_verify_token_123`) — verification could succeed with a publicly guessable value. |
| 3 | High | No startup validation: missing/typo'd env vars silently degraded to "SIMULATED" mode — messages *appeared* to send but never reached Meta. |
| 4 | High | `db.ts` logged the full MongoDB connection string **including the password**. |
| 5 | Medium | No retry logic at all — any transient network blip, HTTP 429 or Meta 5xx permanently dropped the message. |
| 6 | Medium | No delivery tracking: `NotificationLog` recorded only `sent`/`failed` at API-accept time; webhook `statuses` events (delivered/read/failed) were received and **discarded**. |
| 7 | Medium | No duplicate protection: calling a send endpoint twice sent the message twice; replayed Meta webhooks were reprocessed. |
| 8 | Medium | Webhook only processed `entry[0].changes[0]` — Meta batches events, so **additional events in the same delivery were silently lost**. |
| 9 | Medium | Webhook returned 500 on processing errors → Meta retries aggressively and may disable the subscription. |
| 10 | Medium | Phone numbers were not validated — anything non-10-digit was passed through raw; invalid numbers burned an API call and produced cryptic Meta errors. |
| 11 | Medium | Config read at module load (`const X = process.env…` at import time) — fragile against dotenv ordering; the cause of past "why is it simulating?" confusion. |
| 12 | Low | API version pinned to obsolete `v17.0` default (past Graph API sunset horizon). |
| 13 | Low | No health/self-test endpoints; no way to detect an expired token before users complained. |
| 14 | Low | No timeout on `fetch` — a hung connection stalled callers (attendance loops, scheduler) indefinitely. |
| 15 | Low | Dead code: unused `NotificationLog` import in `message.routes.ts`; no error taxonomy (all failures treated identically). |
| 16 | Low | No tests of any kind. |

## 2. Fixes implemented

**New modules**
- `src/config/whatsapp.ts` — single source of truth for all WhatsApp config. Env-only, validated, lazy-loaded, memoized. Simulation mode only when **zero** WHATSAPP_* vars are set; a *partial/invalid* config **aborts startup** with an itemized error list. `resolveTenantConfig(schoolId)` is the seam for future per-school WABAs — callers never touch env directly.
- `src/models/whatsappMessage.model.ts` — every outbound message persisted with `schoolId`, E.164 recipient, type, template name, `wamid`, status (`queued → sending → sent → delivered → read` / `failed`), timestamped status history, attempt count, Meta error details, conversation/pricing metadata, dedupe key (unique index), content hash. Status transitions are **forward-only** → webhook replays are naturally idempotent.
- `src/services/whatsappWebhook.processor.ts` — timing-safe HMAC-SHA256 signature verification, TTL'd duplicate-event cache, batch-safe processing of *all* entries/changes/statuses/messages, delivery/read/failure tracking, webhook stats for health checks.
- `src/services/whatsappHealth.service.ts` — live checks (token validity, Phone Number ID, WABA reachability, webhook config) + startup self-test. Definitive credential failures (Meta codes 0/3/10/102/190) refuse to boot; network blips only warn (`WHATSAPP_STARTUP_MODE=warn` overrides).

**Rewritten**
- `src/services/whatsapp.service.ts` — one hardened dispatcher behind all sends:
  - E.164 normalization/validation before any API call (trunk-0, `00` prefix, default country code 91, length limits).
  - Exponential backoff + full jitter (cap 30 s), honors `Retry-After`. Retries **only** network errors, HTTP 429/5xx, and Meta transient codes (1, 2, 4, 17, 32, 80007, 130429, 131016, 131056) or `is_transient`. Permanent failures (bad number 131026, bad template 132xxx, auth 190/0/10, policy 368…) fail immediately with a human-readable hint from a 30-code taxonomy.
  - 24-h window closure (131047) still auto-falls back to the approved utility template — now recursion-proof.
  - Duplicate suppression: content-hash window (default 60 s, works without MongoDB) + optional caller `dedupeKey` backed by a unique index.
  - 15 s request timeout (AbortController); no call can hang the scheduler.
  - Structured JSON logs on every attempt: timestamp, schoolId, recipient, type, HTTP status, Meta code/subcode, wamid, attempt #. Tokens never logged.
  - **No exported function ever throws**; existing boolean signatures (`sendWhatsAppText/Media/Auto`) unchanged, richer `…Detailed` + `sendWhatsAppTemplate` variants added. Zero changes needed in routes/scheduler.
- `src/routes/shared/whatsappWebhook.routes.ts` — signature-gated POST, instant 200 ACK with async processing, hardened GET verification (hardcoded fallback token removed), new authenticated `GET /api/whatsapp/health` (JWT + `whatsapp:view` permission).
- `src/scripts/setupWhatsAppTemplate.ts` — now checks template **approval status** first (APPROVED/PENDING/REJECTED) instead of blind-creating.
- `src/scripts/testSendWhatsApp.ts` — prints full result + DB lifecycle record.
- `src/server.ts` — raw-body capture for signature verification; `assertWhatsAppConfig()` + live self-test **before** `listen()`; `unhandledRejection`/`uncaughtException` guards; `/healthz` now reports WhatsApp mode.

**Cleanup**
- Removed hardcoded webhook token fallback, dead `NotificationLog` import, module-load env reads. Redacted MongoDB credentials from the connect log. `seed.ts` also purges `whatsappmessages`. Added `.env.example` (placeholders only). Default API version → **v23.0** (env-overridable).
- Legacy `NotificationLog` model retained (nothing reads it; safe to delete later).

**Tests** — `npm test` (vitest, 54 tests): config validation (simulation vs partial vs valid, placeholders, malformed values), E.164 normalization (11 cases), error classification & backoff, send pipeline with mocked Graph API (success, 429-retry, network-retry, no-retry-on-permanent, invalid number short-circuit, 131047 fallback + recursion guard, dedupe, simulation, pathological fetch), webhook signature/duplicate/idempotency/malformed-payload safety.

## 3. Live verification performed

1. `npm run build` — clean. `npm test` — 54/54.
2. Server boot: config validated, self-test **PASSED** (token valid, quality GREEN), template status checked.
3. Real send to **8899582239**: accepted by Meta, `wamid.HBgMOTE4ODk5NTgyMjM5…` returned, MongoDB record shows `queued → sending → sent` history. *(delivered/read arrive via webhook — see §5.)*

## 4. Remaining limitations

- **delivered/read tracking needs a publicly reachable webhook.** Running locally, Meta cannot deliver status events. Once deployed (or tunneled), point Meta at `POST /api/whatsapp/webhook` — code is ready.
- **You are still on Meta's test number** (+1 555-183-4593). Test numbers can only message up to 5 recipients you've added in the dashboard. Production requires registering a real business number.
- Fallback template `school_notification` is **PENDING** Meta review — until APPROVED, sends outside the 24-h window fail (they're recorded as `failed` with a clear reason).
- Sends are direct (with retry), not queued through BullMQ/Redis — a natural next step for very large broadcasts.
- Multi-tenant is a seam, not a feature yet: every message carries a `schoolId` and all credential access goes through `resolveTenantConfig(schoolId)`, so adding per-school WABAs later means implementing only that one function + a credentials store. No calling code changes.

## 5. Manual Meta dashboard steps still required

1. **App Secret** → Meta App Dashboard → Settings → Basic → copy **App Secret** → add `WHATSAPP_APP_SECRET=…` to `.env`. Until then, webhook signatures are not verified (server warns loudly).
2. **Webhook subscription** (when publicly deployed) → App Dashboard → WhatsApp → Configuration → Callback URL `https://<your-domain>/api/whatsapp/webhook`, Verify Token = your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, subscribe to the **messages** field.
3. **Template approval** — watch WhatsApp Manager → Message Templates until `school_notification` is APPROVED.
4. **Production number** — when ready, add/verify a real business phone number, update `WHATSAPP_PHONE_NUMBER_ID`, and complete business verification for higher messaging tiers.

## 6. Security / reliability / performance summary

**Security:** webhook forgery closed (HMAC), guessable verify-token removed, all secrets env-only and never logged (incl. Mongo URI fix), health endpoint authenticated & permission-gated.
**Reliability:** transient failures retried with backoff, permanent ones fail fast with actionable reasons; startup fails loudly on misconfiguration; no send path can throw or hang; webhook ACKs instantly and processes idempotently; duplicate sends suppressed.
**Performance:** 15 s hard timeout stops stalled loops; parallel student/teacher lookups in webhook; batch-safe webhook processing; indexed message collection (`wamid`, `schoolId+createdAt`, `contentHash+createdAt`).
