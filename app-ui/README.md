# School ERP — Mobile app (app-ui)

React + TypeScript + Vite frontend packaged for Android with Capacitor (`appId` `com.schoolhub.app`). It talks to the same backend (`../rnd-service`) as the web app (`../rnd-ui`).

See [`../docs/MOBILE_INTEGRATION.md`](../docs/MOBILE_INTEGRATION.md) for authentication, environment variables, the Android build and deployment order, and [`docs/APP_UPDATES.md`](docs/APP_UPDATES.md) for the in-app update system.

## Quick start

```bash
npm ci
cp .env.example .env.local   # optional: override VITE_API_URL for local work
npm run dev                  # browser dev server, /api proxied to localhost:5000
npm test                     # unit tests
npm run build                # production bundle (uses .env.production)
npx cap sync android         # copy the bundle into android/
```

`VITE_API_URL` (API base including `/api`) is required for native builds; production is set in `.env.production`.
