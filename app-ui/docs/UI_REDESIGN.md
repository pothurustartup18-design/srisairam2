# UI/UX Redesign — Design System, App Shell and Mobile Experience

This document records what changed in the `rnd-ui` front end, how functionality
was protected, how it was tested, and what is still open. No backend code,
API contract, route, permission or payload was changed.

## 1. Visual direction and design-system decisions

**"Calm academic"**: a quiet, trustworthy product look with one strong brand colour,
cool neutral surfaces, generous spacing and no decorative gloss.

| Decision | Choice | Why |
|---|---|---|
| Brand colour | Royal blue ramp (`--brand-50…900`, primary `#2F55E4`) | Trustworthy, high contrast on white, works for every role |
| Role accent | Admin indigo, Teacher teal, Parent blue, Super admin violet (`[data-role]` → `--accent`) | Quiet signal of which portal you are in (active nav, avatar, role labels) without fragmenting the system |
| Typography | Plus Jakarta Sans 400–800, tabular figures in tables/KPIs | Modern, very legible at small sizes; numbers align |
| Surfaces | Canvas `#F4F6FB`, white cards, hairline borders, soft 2-layer shadows | Clear hierarchy without heavy chrome |
| Radius | 8 / 10 / 14 / 18 / 24 px | Consistent family; larger radii only for sheets and auth card |
| Motion | 120–260 ms ease-out, slide-up sheets, no shine/bounce effects; `prefers-reduced-motion` respected | Cheap on low-end Android, never distracting |
| Dark mode | Full token set under `.dark`; reachable from the account menu / More sheet | The app already had a theme toggle function but nothing in the UI called it |

The previous iOS-style glossy tab bar (specular highlights, sheen sweep and spring animations)
and its duplicated per-portal copies were removed.

## 2. Tokens (single source of truth)

`src/styles/tokens.css` defines every value as a CSS variable;
`tailwind.config.ts` maps Tailwind's theme onto them, so existing utilities
(`bg-blue`, `text-slate-*`, `shadow-card`, `rounded-lg`…) across all 145 source
files picked up the new system automatically.

- Colour: `--brand-*`, `--accent*`, `--canvas`, `--surface`, `--surface-2/3`, `--line`, `--line-strong`, `--ink`, `--ink-2`, `--muted`, `--faint`, `--success/warning/danger/info` (+ `-soft`)
- Type scale: `--text-2xs … --text-4xl` (fluid `clamp()` for the two largest)
- Spacing: `--space-1 … --space-10` (4 px base)
- Radius: `--radius-sm … --radius-2xl`; Elevation: `--shadow-xs/card/raised/overlay`, `--focus-ring`
- Controls & layout: `--control-h` (44 px), `--control-h-sm`, icon sizes, `--sidebar-w`, `--sidebar-rail-w`, `--topbar-h`, `--appbar-h`, `--bottomnav-h`
- Safe areas: `--sat/--sab/--sal/--sar`; Motion: `--ease-out`, `--dur*`
- New semantic Tailwind utilities: `bg-canvas`, `bg-surface(-2/3)`, `text-ink(-2)`, `text-muted`, `text-faint`, `border-line(-strong)`, `bg-accent(-soft)`, `text-success` etc., `h-control`, `min-h-tap`, `shadow-raised/overlay/focus`

Brand colours hard-coded in module stylesheets (138 occurrences) were remapped to tokens.
PDF/receipt/report-card generators were deliberately left untouched (their colours feed jsPDF / html2canvas output).

## 3. Reusable components created or redesigned

| Component | Location | Notes |
|---|---|---|
| **AppShell** (new) | `components/ui/AppShell/` | One frame for all four portals — see §4 |
| Card, SectionHeader, StatTile, QuickAction, ListRow (new) | `components/ui/Card.tsx` | Dashboard building blocks; tiles/rows become buttons when clickable |
| Field, `inputClass`, `selectClass`, `textareaClass` (new) | `components/ui/Field.tsx` | Labelled 44 px controls with hint/error, visible focus ring |
| SegmentedTabs (new) | `components/ui/SegmentedTabs.tsx` | `tablist` semantics; 2-column grid on phones so nothing scrolls off-screen |
| `useOverlay` hook (new) | `hooks/useOverlay.ts` | Escape + **Android back** close, scroll lock, focus into panel and back to opener |
| Modal, Drawer | `components/ui/` | Token/dark styles, `role="dialog"`, `aria-labelledby`, `dvh` limits, pinned footers with safe-area padding, back-button close |
| Button | `components/ui/Button.tsx` | Token variants, `aria-busy` loading state, press feedback |
| KpiCard, Badge, DataTable, MobileRowCard, FilterToolbar, EmptyState, LoadingSpinner, PageHeader | `components/ui/` | Moved to semantic tokens (gains dark mode), compact phone sizing |
| Toast | `shared/Toast` | Sits **above the tab bar** on phones, `role=status/alert`, single CSS source |
| ConfirmDialog | `shared/ConfirmDialog` | Rebuilt on Modal + Button (stacked full-width actions on phones) |
| AuthLayout | `shared/LoginPage/AuthLayout.tsx` | Brand panel + form card; shows success vs error toast correctly |
| TeacherHome (new) | `teacher/TeacherHome/` | Extracted from TeacherPortal and redesigned |

Removed: `shared/Sidebars` (replaced by AppShell), `ConfirmDialog.css`, ~2,000 lines of
obsolete shell/teacher-home CSS (`index.css` went from 3,495 to ~1,460 lines).

## 4. Navigation and responsive layouts

| Width | Layout |
|---|---|
| < 768 px (phones) | App bar (school mark or **Back to home**, page title, contextual control, avatar → profile); fixed **bottom tab bar** (4 primary destinations + More); **More sheet** grouping every other destination plus Settings, Dark mode and Sign out |
| 768–1023 px (tablet) | Icon rail sidebar (expandable) + top bar with page title |
| ≥ 1024 px (desktop) | Grouped sidebar (section headings, active indicator, unread badges, account menu) + top bar (title, subtitle, search / class picker, actions) |

- Tabs per role — Admin: Home, Students, Fees, Attendance (permission-filtered, falls back to the next permitted destinations); Teacher: Home, Attendance, Marks, Messages (permission-filtered); Parent: Home, Attendance, Results, Fees; Super admin: Home, Database, Sessions, Queues.
- Every destination that existed in the old sidebars is in the new sidebar and More sheet, gated by the **same permission strings** as each portal's existing redirect effect.
- **Admin previously had no phone navigation** other than a drawer and a header crammed with a search field; it now has the same tab bar / More sheet as the other roles, and its global search appears at the top of the four views it filters.
- **Back behaviour**: the shell registers one Android back handler (More sheet → account menu → home view → app's double-press-exit). It is registered once so screen-level handlers (TeacherMarks, TeacherMessages) and dialogs stay above it.
- Chat screens (Admin, Teacher, Parent messages) get the full page height; the old negative-margin / `calc(100vh-…)` hacks were removed.
- Safe areas: app bar, tab bar, sheets, dialog footers and the auth screen pad for notches/gesture bars; the floating "Submit attendance" button is offset from the tab bar by tokens.
- 16 px phone inputs (prevents iOS zoom), 44 px minimum touch targets on all new controls.

## 5. Screens

### Redesigned structurally
- **Sign-in, Super-admin sign-in, Forgot password, Forced password change** (shared AuthLayout; login form rebuilt on Field/Button with labelled password toggle and `tablist` role selector)
- **App shell for Admin, Teacher, Parent, Super admin**
- **Teacher home** — single responsive layout built around today's register (rate ring, status, CTA), 4 tappable stat tiles, unread banner, students-needing-attention list, permission-aware quick actions. Replaces separate mobile/desktop markup (~400 lines).
- **Parent home** — greeting, child card with ward switcher, 4 stat tiles, needs-attention list, academic performance, fees and homework cards, class-teacher contact card (message/call/email), attendance, notices & events, shortcuts. 1,214 → 655 lines.
- **Admin dashboard** — token cards, 2-up KPI grid and 2×2 quick actions on phones, right column moved to `xl` so it no longer overflows at 1024 px.
- **Super admin console** — on the shared shell in a forced-dark scope (its content is a dark developer console); grids and header rows made responsive.

### Refreshed through the design system plus targeted fixes
All other screens inherit tokens, typography, components and dark-mode overrides. Targeted fixes:
Teacher Attendance (stacked phone header, 44 px segmented control and date picker),
Admin Attendance (SegmentedTabs), Admin Expenditures (full-width phone tabs),
Students / Teachers / Fee Analytics / Admin Attendance / Teacher Fees KPI rows (2-up on phones),
Admin / Teacher / Parent Messages (full-height, footer no longer overflows, brand accent instead of red),
Parent Feedback (chips fit 320 px), Super admin WhatsApp / Queues / Redis / DB Explorer (wrapping rows, fluid widths).

## 6. Functionality-preservation measures

- **No API, payload, route, permission or business-rule changes.** Portals keep all their state, fetches and handlers; only their render trees and chrome changed. Data-loading code was moved verbatim.
- View keys (`activeView` values), deep-link parameters (`?verify_token`, `?report_verify_token`, `/superadmin`) and role routing in `App.tsx` are unchanged.
- Navigation is filtered with the exact permission keys used by each portal's existing redirect effect, so no screen became reachable that wasn't before.
- Regression tests assert request contracts (login body, attendance POST body keys) — see §8.
- `Button` deliberately keeps the browser's default `type` so existing form submits keep working.

### UI-layer fixes made during the redesign (no business logic changed)
1. **Error boundaries are now keyed per view** in every portal. Previously one crashing screen locked the whole portal on "Something went wrong" until reload; Teacher and Super admin had no per-view boundary at all.
2. **Mojibake repaired** in AdminPortal, AdminSettings and TeacherMarks (UTF-8 decoded as Windows-1252 — visible strings like "View Fee Analytics â†’", "âœ“", "ðŸ’³").
3. **Admin delete confirmation password** was a plain `type="text"` field; it is now masked (`type="password"`, original `autoComplete="new-password"` kept).
4. **Rules-of-Hooks bugs** fixed in ParentDashboard and ParentProfile (a `useMemo` ran after an early return).
5. Teacher title/class-picker overlap on the phone app bar (title was absolutely centred) — fixed by the new app bar.
6. The auth toast always showed an error icon, even for "Welcome back" — now matches the toast type.

## 7. Pre-existing issues found and **not** changed (need product decisions)

| # | Issue | Where |
|---|---|---|
| 1 | Fabricated fallback figures shown when dashboard data is missing (e.g. 94.2 % attendance, "2 unmarked classes", breakdown 96/94/93 %) | `AdminDashboard.tsx` ~L193–213, L642–656 |
| 2 | Hard-coded personal fallback profile ("Jaswanth Pothuru", phone, email) used when the API omits fields | `authContext.tsx` |
| 3 | Admin header bell only shows a fixed toast "Notice: Standard Schedule active" | `AdminPortal.tsx` |
| 4 | Teacher attendance toast says absent alerts were sent "(Simulated)" | `TeacherPortal.tsx` `handleAttendanceSubmit` |
| 5 | Login "Backend Server URL" modal has no trigger (unreachable) | `LoginPage.tsx` |
| 6 | Parent desktop header search box did nothing (state never used) — **removed** as a dead control | old `ParentPortal.tsx` |
| 7 | Desktop parent "Attendance overview" sparkline was a fixed SVG path, not data — **replaced** with real present/absent figures | old `ParentDashboard.tsx` |
| 8 | `/attendance/student-stats` returning no `stats` crashes TeacherPortal (`setAttendanceStats(undefined)`) | `TeacherPortal.tsx` |
| 9 | Admin "Pending Fees" KPI passes `valueColor` that the local KpiCard ignores | `AdminDashboard.tsx` |
| 10 | On phones, Messages opens straight into a full-screen conversation covering the tab bar (`activeThreadMobile` defaults to `true`); users leave via the chat's back arrow | `ParentMessages.tsx` |
| 11 | 21 small selectors in `index.css` are no longer referenced | `index.css` |

## 8. Tests — commands and results

Baseline (before any change) and final results, run in `rnd-ui/`:

| Command | Baseline | Final |
|---|---|---|
| `npm test` (vitest) | 75 / 75 passed | **75 / 75 passed** |
| `npx tsc -p tsconfig.app.json --noEmit` | 134 errors (pre-existing; the build does not typecheck) | **107** errors — none introduced, 27 removed |
| `npm run lint` (oxlint) | 157 warnings, 2 errors | **134 warnings, 0 errors** |
| `npm run build` | success | **success** |
| `npm run test:e2e` (Playwright, new) | — | **24 / 24 passed** |

### Browser tests added (`e2e/`)
Run against a production build served by `vite preview`; every `/api` call is answered by
test fixtures (`e2e/fixtures.ts`) — **no mock data exists in application code**.

- `audit.spec.ts` — for each role and **every navigable view** at all 12 required viewports
  (320×568 … 1440×900): reloads at that size, navigates the way a user would (sidebar, tab bar or More sheet),
  fails on error-boundary screens and reports any element extending past the viewport outside a deliberate scroll container.
- `workflows.spec.ts` — sign-in for admin/teacher/parent asserts `POST /auth/login` body `{username,password}` and portal routing;
  wrong-portal error; password toggle; every screen reachable on phone and desktop for all four roles;
  in-app back + More sheet Escape; sign-out calls `POST /auth/logout`; custom employee (`role: other`) sees only permitted screens and no Settings;
  dark-mode toggle persists; teacher attendance submit keeps the request body keys `date, classTeacherId, class, records, sendAlerts`
  and the floating submit button clears the tab bar; toasts clear the tab bar.

Responsive audit progression (view × viewport combinations with overflow or crash):
before redesign 12 (SuperAdmin at every phone width, Parent home at 320, Parent chat at 360) →
first shell pass revealed screen crashes masked by a shared error boundary → **final: 0** (all roles, all views, all 12 viewports).

## 9. Dependencies

None added or removed. Playwright (already a devDependency) is now used; the font is loaded from Google Fonts like the previous one.

## 10. Limitations and untested behaviour

- **No real-device testing** was possible here. Verified in Chromium with device-sized viewports only; on-device keyboard behaviour, real safe-area insets, Android hardware back and Capacitor status-bar handling still need a pass on a physical phone (the back-button logic is unit-level reasoning plus the in-app back test).
- Tests use fixture data; screens whose content depends on data shapes not covered by fixtures were checked for layout and crashes, not for every data state.
- Browser zoom levels and very long content were not exhaustively tested.
- Inner module screens (e.g. Settings, Fee collection, Marks entry, Students drawer forms) received the design-system refresh and overflow fixes, not a ground-up structural redesign.
- The Google-Fonts font needs network access; offline it falls back to the system UI font.

## 11. Running and reviewing

```bash
cd rnd-ui
npm install
npm run dev                 # app at http://localhost:5173 (backend expected on :5000)
npm test                    # unit tests
npm run test:e2e            # browser regression + responsive audit (builds, no backend needed)
AUDIT_SHOTS=1 AUDIT_OUT=./audit npm run test:e2e:audit   # also saves screenshots per view/size
AUDIT_SIZES=360x800,1440x900 npm run test:e2e:audit       # limit the audit to some sizes
npm run cap:android         # build + sync the Android app
```

To review dark mode, open the account menu (desktop sidebar footer) or More sheet (phone) → Dark mode.

## 12. Route-by-route checklist

Legend: **R** structurally redesigned · **S** design-system refresh · **F** targeted responsive fix ·
✓ = reachable on phone and desktop and audited at all 12 viewports with no overflow and no crash in the final run.

| Portal | View key | Screen | Work | Tested |
|---|---|---|---|---|
| Public | `/` signed out | Sign in | R | ✓ |
| Public | `/superadmin` | Super-admin sign in | R (shared layout) | ✓ |
| Public | — | Forgot password, Forced password change | R (shared layout) | build only |
| Public | `?verify_token`, `?report_verify_token` | Receipt / report-card verification | S | not audited (needs tokens) |
| Admin | `dashboard` | Dashboard | R/F | ✓ |
| Admin | `fee-analytics` | Fee analytics | S/F | ✓ |
| Admin | `collect-fee` | Collect fee (from dashboard/analytics) | S | via flows only |
| Admin | `reminders` | Fee reminders | S | ✓ |
| Admin | `expenditures` | Expenditure | S/F | ✓ |
| Admin | `students` | Students | S/F | ✓ |
| Admin | `teachers` | Teachers | S/F | ✓ |
| Admin | `leaves` | Leave requests | S | ✓ |
| Admin | `attendance` | Class attendance | S/F | ✓ |
| Admin | `marks` | Exams & marks | S | ✓ |
| Admin | `homework` | Homework | S | ✓ |
| Admin | `messages` | Direct messages | S/F | ✓ |
| Admin | `events` | Notice & events | S | ✓ |
| Admin | `feedbacks` | Parent feedbacks | S | ✓ |
| Admin | `settings` | Settings | S | reachable (account menu); not audited |
| Admin | `profile` | My profile | S | reachable; not audited |
| Teacher | `home` | Dashboard | R | ✓ |
| Teacher | `attendance` | Attendance | S/F | ✓ |
| Teacher | `marks` | Marks entry | S | ✓ |
| Teacher | `students` | My students (class teachers) | S | ✓ |
| Teacher | `analytics` | Exam analytics | S | ✓ |
| Teacher | `homework` | Homework | S | ✓ |
| Teacher | `messages` | Direct messages | S/F | ✓ |
| Teacher | `notices` | School notices | S | ✓ |
| Teacher | `fees` | Fees management | S/F | ✓ |
| Teacher | `leaves` | Leave application | S | ✓ |
| Teacher | `delegations` | Permission transfer | S | ✓ |
| Teacher | `signature` | My signature | S | ✓ |
| Teacher | `profile` | My profile + app updates | S | reachable; not audited |
| Parent | `dashboard` | Home | R | ✓ |
| Parent | `attendance` | Attendance | S | ✓ |
| Parent | `results` | Academics | S | ✓ |
| Parent | `fees` | Fee details | S | ✓ |
| Parent | `homework` | Homework | S | ✓ |
| Parent | `notices` | Notices & events | S | ✓ |
| Parent | `profile` | Child overview | S (hook fix) | ✓ |
| Parent | `messages` | Messages | S/F | ✓ |
| Parent | `feedback` | Feedback & help | S/F | ✓ |
| Parent | `account` | My account + app updates | S | reachable; not audited |
| Super admin | `dashboard`, `database`, `whatsapp`, `sessions`, `audit`, `flags`, `queues`, `redis`, `collections` | Console | R (shell)/F | ✓ |
