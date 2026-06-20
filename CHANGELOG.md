# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [0.6.0] — 2026-06-20 — List audience targeting + editable lists + send fix (Session 7)

### Fixed

- **`sendCampaign` server action error** — Converted all `db.query.*` relational API calls to `db.select()` in the send path (`src/app/(dashboard)/campaigns/actions.ts`, `src/lib/queue/sender.ts`). The relational API can silently return `null` on a stale dev server (WSL2/NTFS inotify limitation from Session 4), causing `enqueueCampaign` to throw `Campaign not found`. Now uses the same `db.select().from().where().limit(1)` pattern as the already-reliable `getCampaign` query. Also added an explicit guard: if campaign is already in a non-sendable state when the action fires, it redirects to the detail page instead of throwing.

### Added

- **Send campaign to specific lists** — Campaigns now have a list audience picker in the editor Settings tab. Users select one or more lists; unselected = send to all subscribed contacts. The selection is saved in `campaigns.audience.lists` (existing JSONB column). Changes:
  - `campaigns/actions.ts`: `updateCampaign` now accepts and persists `audience` payload
  - `components/editor/campaign-editor.tsx`: new Audience section in Settings tab with checkboxes per list, subscriber count shown, `selectedLists` state wired to save
  - `campaigns/[id]/edit/page.tsx`: fetches available lists + passes `audience` to editor
  - `campaigns/[id]/page.tsx`: shows audience list names (or "All subscribers") in Details card
  - `enqueueCampaign` in `sender.ts` was already audience-aware; no changes needed there

- **Editable lists** — New page at `/lists/[id]` lets users rename a list, edit its description, view current members, add subscribers not yet in the list, and remove members. Changes:
  - `src/app/(dashboard)/lists/[id]/page.tsx`: new server component with settings form + members table + add-subscriber table
  - `src/app/(dashboard)/lists/actions.ts`: added `updateList`, `addToList`, `removeFromList` server actions
  - `src/server/queries.ts`: added `getList`, `getListMembers`, `getSubscribersNotInList` queries
  - `src/app/(dashboard)/lists/page.tsx`: list name is now a link to the edit page; added edit icon button per row

---

## [0.5.0] — 2026-06-19 — Campaign editor inspector scroll (Sessions 5–6)

### Fixed

- **Campaign editor inspector panel clipped with no scrollbar** (`src/components/editor/campaign-editor.tsx`). When a block was selected in the structure tree, the "Edit block" inspector showed some fields but cut off the rest with no scrollbar.

  **Root cause (Round 1):** Two missing CSS properties broke the flex height-propagation chain. `aside` lacked `overflow-hidden`, so browsers did not treat its cross-axis-stretched height as "definite" for flex children. `Tabs` lacked `min-h-0`, preventing it from shrinking below content height. Together these caused the top zone (`flex-1`) to expand to its full content height, pushing the inspector below the viewport boundary where it was clipped with no scrollbar.

  **Root cause (Round 2):** Even with Round 1 in place, `max-h-[40vh]` was unreliable — viewport-relative units can coincide with content size, leaving exactly zero scroll headroom. Switched to `max-h-[45%]` (percentage of the definitively-sized `TabsContent` parent) so the constraint always sits below the parent boundary. Also added `overflow-hidden` to `TabsContent` as defence.

  **Final fix applied to `src/components/editor/campaign-editor.tsx`:**
  - `aside`: added `overflow-hidden`
  - `Tabs`: added `min-h-0`
  - `TabsContent[blocks]`: added `overflow-hidden` + `min-h-0`
  - Inspector div: `max-h-[40vh]` → `max-h-[45%]`

### Changed (Session 5)

- **Blocks tab restructured into two independent scroll zones:**
  - Top zone (`flex-1 min-h-0 overflow-y-auto`): block library + structure tree
  - Bottom zone (`max-h-[45%] shrink-0 overflow-y-auto`): "Edit block" inspector, pinned to sidebar bottom
- **Section block inspector** — Added `Padding left` and `Padding right` number inputs (attrs existed in defaults but had no UI).

### Verified (Session 6)

Browser-verified via Playwright chromium_headless_shell with `LD_LIBRARY_PATH` pointing at `libnspr4.so`/`libnss3.so` extracted from `.deb` packages (no sudo). Results at 900×700 viewport:

- **Heading block:** Text ✅, Level ✅, Align ✅ — all 3 fields visible; inspector `overflow-y: auto`, `clientH=258 scrollH=260`
- **Section block:** Background color ✅, Padding top ✅, Padding bottom ✅, Padding left ✅, Padding right ✅ — all 5 fields; `clientH=258 scrollH=268 overflow-y: auto`
- **Scrollbar activation:** At 500px-tall viewport, heading inspector hits `clientH=168 scrollH=260` → `hasScroll: true` — scrollbar appears correctly when content overflows
- **App-wide scan:** Grep of all source files found no other nested-flex scroll patterns that need fixing. Dashboard pages use simple `overflow-y-auto` on the main scroll wrapper; nav sidebar has `nav.flex-1.overflow-y-auto` — both correct.

---

## [0.4.0] — 2026-06-18 — Fix campaign edit 404 (Session 4)

### Fixed

- **`/campaigns/[id]/edit` returning 404** — `getCampaign()` in `src/server/queries.ts` was using Drizzle's relational query API (`db.query.campaigns.findFirst()`) which was silently returning `null` for valid campaigns. The underlying cause: Turbopack's file watcher does not fire `inotify` events for files on the NTFS-mounted Windows drive (`/mnt/d/`), so the dev server from session 3 was still running a stale compiled version of the function. Fixed by:
  1. Rewriting `getCampaign` to use the standard Drizzle select API (`db.select().from(campaigns).where(...)`) — matching the pattern already used by `listCampaigns` and confirmed working.
  2. Restarting the dev server so all source files are re-read from disk.
  
  The campaign block editor now loads correctly at `/campaigns/[id]/edit` and the full three-pane editor (block palette, live MJML preview, structure tree) renders as expected.

### Known dev environment caveat

WSL2 projects stored on the Windows filesystem (`/mnt/d/`, `/mnt/c/`, etc.) do not trigger `inotify` file change events. This means `next dev` (Turbopack or webpack) will NOT pick up file edits via HMR when the project lives on a Windows NTFS drive. Workaround: restart the dev server after making changes in Claude Code (which edits files via the WSL2 mount). If files are moved to the WSL2 native filesystem (e.g., `~/projects/`), HMR works normally.

---

## [0.3.0] — 2026-06-17 — Lettermark Design System implementation (Session 3)

Design-system styling pass. The app is imported from the **Lettermark Design System** project on Claude Design (`3f5507eb-975a-410d-8e5b-d18730c37ef1`) and all visual tokens, brand marks, and UI patterns are applied to the live codebase. Zero new routes or schema changes — this is a pure visual layer.

### Added

- **`src/components/ui/lettermark-icon.tsx`** — `<LettermarkIcon>` React component built from the locked SVG artwork (Sapphire rounded-square + white double-L bookmark mark). Accepts `size` and `white` props.

### Changed — Design tokens

- **`src/app/globals.css`** — Full Lettermark token set replacing the generic shadcn defaults:
  - Palette: Sapphire `#1C4FC4` (primary), Cloud `#F8F9FF` (background), Abyss `#1A1A2E` (foreground + sidebar), Haze `#E8ECF8` (secondary/muted), Dusk `#5C6080` (muted-foreground), Mist `#C8D0E8` (border/input), Error `#C0392B` (destructive).
  - `--radius` changed from `0.5rem` → `0.375rem` (6px base).
  - Added `--c-*` hex convenience vars for direct CSS use (sidebar, sidebar-surface, all brand colours).
  - Added `--shadow-sm/md/lg` — soft Abyss-tinted shadows for the Cloud canvas.
  - Dark theme updated to match design system values.

- **`tailwind.config.ts`** — Updated to use design system vars:
  - `borderRadius.md` → `var(--radius)` (6px — buttons, inputs); `borderRadius.lg` → `0.6875rem` (11px — dialogs); `borderRadius.xl` → `0.75rem` (12px — auth card).
  - `boxShadow` overridden to use `var(--shadow-sm/md/lg)`.
  - Chart colour tokens added (`chart-1` through `chart-5`).
  - Instrument Serif added to `fontFamily.display`.

### Changed — Branding

- **`src/components/layout/sidebar.tsx`** — Dark Abyss sidebar (`#1A1A2E`) replacing the light `bg-card` surface. Nav link states updated for dark surface: `text-white/70` default → `bg-white/[0.06] text-white` hover → `bg-primary/[0.22]` + inset Sapphire border active + Sapphire icon. Dusk (`#5C6080`) section labels. White avatar chip. `Mail` icon swapped for `<LettermarkIcon>`. "Postmark" → "Lettermark".
- **`src/app/(auth)/layout.tsx`** — Replaced header-bar layout with full Cloud canvas + 4 faint Sapphire cloud SVG motifs. Large 44px `<LettermarkIcon>` + 38px "Lettermark" wordmark above a `rounded-xl` card surface. "Postmark" → "Lettermark".
- **`src/app/(dashboard)/layout.tsx`** — Mobile header updated: `Mail` → `<LettermarkIcon>`, "Postmark" → "Lettermark", `bg-background/80 backdrop-blur` sticky header.
- **`src/app/layout.tsx`** — Metadata renamed to Lettermark. `themeColor` updated to Cloud `#F8F9FF` / Abyss `#1A1A2E`. Instrument Serif loaded via `next/font`.

### Changed — Copy & microcopy

- **`src/app/(auth)/login/page.tsx`** — "Sign in to your workspace" → "Log in to your Lettermark account".
- **`src/app/(auth)/login/login-form.tsx`** — "Sign in" / "Signing in…" → "Log in" / "Logging in…". Added `placeholder` on email field.
- **`src/app/(auth)/register/page.tsx`** — "Create your workspace" → "Create your account". "Sign in" link → "Log in".

### Changed — UI refinements

- **`src/components/ui/table.tsx`** — `TableHeader` gets `bg-muted/60` Haze fill (per design spec: "header rows sit on a Haze fill"). `EmptyState` no longer has a dashed border — plain centred block with `p-12`.
- **`src/app/(dashboard)/analytics/page.tsx`** — KPI metric values now render in Sapphire (`text-primary`) at `text-[28px]` matching the design system's analytics KPI style.

---

## [0.2.0] — 2026-06-17 — Startup fixes & dev environment setup

### Fixed

- **pnpm 11 native build scripts blocked by default** — Project uses pnpm v11.7.0 (via corepack). pnpm 11 introduced a security policy that blocks all package build/install scripts unless explicitly approved. After a fresh `pnpm install`, `argon2` (password hashing) and `esbuild` (required by Next.js Turbopack) were silently not compiled, causing `pnpm dev` and `pnpm build` to exit with code 1. Fixed by adding `allowBuilds: true` for `argon2`, `esbuild`, `sharp`, and `unrs-resolver` in `pnpm-workspace.yaml` (pnpm 11's config location — the old `pnpm.onlyBuiltDependencies` field in `package.json` is deprecated).

- **Operational scripts didn't load `.env`** — `scripts/migrate.ts`, `scripts/seed.ts`, and `scripts/worker.ts` are run with `tsx` directly, which does not auto-load `.env` (unlike Next.js which does). Running `pnpm db:migrate` without `DATABASE_URL` in the shell environment exited with code 1 immediately. Fixed by adding `import 'dotenv/config'` as the first import in all three scripts. Added `dotenv` to `dependencies`.

- **Wrong `DATABASE_URL` in `.env`** — `.env.example` defaulted to `postgres://postgres:postgres@localhost:5432/newsletter` (the built-in superuser) but the setup instructions create a dedicated `newsletter` user. Updated `.env` default to `postgres://newsletter:newsletter@localhost:5432/newsletter`.

### Added

- `dotenv` dependency for `.env` loading in operational scripts.
- `pnpm-workspace.yaml` with `allowBuilds` configuration for native modules.
- `pnpm-lock.yaml` committed for reproducible installs.

---

## [0.1.0] — 2026-06-16 — GOD MODE compile review (first working build)

Starting point: ~97 source files written but never compiled. Zero test runs, no migrations generated.

### Fixed — Functional bugs

- **Email rendering broken** — `mjml2html()` is async in MJML v5 but was called synchronously in `src/lib/email/render.ts`. Every campaign send and preview returned broken/empty HTML. Fixed: `renderEmail` is now `async`, all callers `await` it.

- **Confirmation emails broken** — `/api/subscribe`'s `sendConfirmationEmail` passed `to: opts.to` as a bare email string, but every provider's `send()` expects `to: { email, name? }`. Fixed the shape.

- **Hosted subscribe form showed raw JSON** — Plain `<form method="post">` submissions to `/api/subscribe` (both the hosted `/subscribe/[formId]` page and the embed snippet) navigated to a bare JSON response. Fixed: detect `Accept: text/html` headers (set by plain browser POSTs) and return a `303` redirect to `/subscribe/{formId}?status=pending|subscribed` instead. Added `status=error` handling in the subscribe page.

- **Automation triggers never fired** — `enrollSubscriber()` was exported from `runner.ts` but never called from anywhere — automations were 100% dead code. Fixed: added `triggerWorkflows()` helper to `runner.ts` and wired it into `/api/subscribe` (no-double-opt-in path), `/confirm/page.tsx` (double-opt-in confirmed path), and the list/tag assignment loops in `/api/subscribe`.

- **Soft-bounce escalation bug** — `webhook-utils.ts` set `status: 'soft_bounced'` only after ≥3 soft bounces and never applied `soft_bounced` for <3 bounces. Fixed: sets `soft_bounced` immediately on any soft bounce event, escalates to `hard_bounced` after ≥3.

- **Missing `/profile` route** — The `{profile}` merge tag in email footers resolves to `/profile?s=&t=` but no route existed (would 404 for every subscriber). Built the complete page: HMAC signature validation, subscriber name-edit form, unsubscribe link, and `actions.ts`.

- **Worker Docker command broken** — `docker-compose.yml` used `node --experimental-strip-types scripts/worker.ts` which requires Node 22.6+ but the Docker image uses Node 20. Fixed: `node_modules/.bin/tsx scripts/worker.ts`.

- **MJML empty attribute warnings** — `render.ts` emitted `color=""` / `font-family=""` when blocks had no explicit colour set, which MJML flagged as invalid and which interfered with `<mj-attributes>` defaults. Fixed: added `optAttr()` helper that omits the attribute entirely when the value is empty/undefined.

- **Dead `/forgot` link** — Login form linked to `/forgot` but no password-reset route exists. Removed the link.

### Fixed — TypeScript errors

- `useActionState` initial state type mismatches across all 7 action forms (subscribers, lists, tags, forms, automations, settings account, import). Added explicit `XActionState` types; removed all `as any` casts.
- `BlockWithChildren` interface tried to `extend` a union type (TS2312). Removed the interface — `AnyBlock` already carries `children?: AnyBlock[]` on every variant.
- `number[] | null` not assignable to `number[]` in campaign editor (null-narrowing gap). Fixed with `selected &&` guard.

### Fixed — ESLint errors

- `react-hooks/set-state-in-effect` rule (react-hooks v7) flagged 5 places. Fixed properly: workflow-editor JSON parsing moved to `useMemo`; delivery-form kind-change uses "adjust state during render" pattern; create-tag/list modal-close uses the same pattern; campaign-editor preview effect's synchronous `setState` calls moved into `setTimeout` or replaced by the `updateDoc` wrapper.

### Fixed — Dependencies

- Upgraded `drizzle-kit` `0.19.x` → `0.31.10` to match `drizzle.config.ts`'s `dialect: "postgresql"` syntax (old version only knew `generate:pg`).
- Upgraded `@types/react` / `@types/react-dom` 18 → 19 to match React 19 runtime.
- Upgraded `eslint-config-next` 15 → 16 to match Next.js 16. Replaced removed `next lint` CLI with `eslint .` script.
- Created `eslint.config.mjs` flat config (required for ESLint 9 — Next.js 16 ships ESLint 9 which dropped `.eslintrc`).
- Moved `pg` to `dependencies` (it's a runtime dep, not dev-only).
- Pinned `react` / `react-dom` to `^19.0.0` (removed stale `-rc` prerelease tag).

### Added

- `drizzle/0000_nifty_legion.sql` — first migration generated from schema.
- `src/app/(public)/profile/` — subscriber profile page (name edit + unsubscribe link).
- `eslint.config.mjs` — ESLint 9 flat config.

### Verified working (end-to-end)

Tested against a live Postgres instance via Playwright + Chrome Headless Shell on the production build (`node .next/standalone/server.js`):
- Login / logout
- Dashboard (stats, growth chart, recent campaigns table)
- Campaign editor + MJML preview (debounced, updates in ~400ms)
- Settings / Delivery tab
- Hosted subscribe form → redirect flow
- `/profile` with valid and invalid HMAC signatures
