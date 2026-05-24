# Project: jottapp

## Overview

jott is a standalone, offline-first, timestamped personal journal. The user types short notes captured in timeline order, tags them with `#topic` / `@person` chips, and can drop in images — everything persists to a local SQLite file. Ships as a single Bun-compiled binary that serves a React UI from an embedded Hono server, and as a native macOS `.app` via a Tauri 2 shell that wraps the same binary as a sidecar inside a WKWebView.

## Stack

- **Runtime / bundler:** Bun ≥ 1.3.13 (pinned via `packageManager`; Node ≥ 24 needed only for tooling bits).
- **Language:** TypeScript, `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `isolatedModules`. Path aliases: `@backend/*`, `@frontend/*`, `@shared/*`.
- **Backend:** Hono `^4.12` on `Bun.serve`; tRPC `^11.17` mounted at `/api/trpc` via `@trpc/server/adapters/fetch`. Zod for input validation.
- **Database:** `bun:sqlite` + Drizzle ORM `^0.45` (`drizzle-orm/bun-sqlite`). WAL + `foreign_keys=ON`. Migrations are raw `.sql` files imported with Bun's `with { type: 'text' }` attribute.
- **Frontend:** React 19, Vite 8 (`bun --bun vite`), Tailwind v4 (`@tailwindcss/vite`), wouter for routing, TipTap `^3.23` for the editor, `@trpc/react-query` for data fetching.
- **Native shell:** Tauri 2.11 — `tauri/` Cargo crate named `jott` (not the default `app`), backend invoked as a sidecar via `externalBin`.
- **Lint / format:** Biome `^2.4` (single tool for both). Single quotes, trailing-all commas, semicolons, 100-char line width, 2-space indent.
- **Test:** `bun:test` (built-in). No vitest, no jest.
- **CI:** GitHub Actions.

## Key Commands

- **Install:** `bun install` (CI uses `--frozen-lockfile`).
- **Dev:** `bun run dev` — single Vite process serving frontend on `127.0.0.1:4853` and running the Hono backend in-process via `@hono/vite-dev-server` (Bun adapter). `bun run dev:seed` seeds demo data. `bun run dev:backend` runs the standalone server.
- **Test:** `bun test` (framework: `bun:test`, files: `*.test.ts` co-located next to source).
- **Lint:** `bun run lint` (`biome check .`) / `bun run lint:fix`.
- **Format:** `bun run format` / `bun run format:check`.
- **Typecheck:** `bun run typecheck` (`tsc --noEmit`).
- **Build (binary):** `bun run build` → `./jottapp` (single file, ~65 MB, UI embedded via `bun build --compile`).
- **Build (Tauri app):** `bun run tauri:build`. Sidecar is built by `bun run build:backend` → `scripts/build-sidecar.ts`, which detects host triple and writes `tauri/binaries/jottapp-backend-<CARGO_TRIPLE>`.
- **Deploy:** publish a GitHub release in the UI; the `Release` workflow (`.github/workflows/release.yml`) fires on `release: published`, builds Tauri apps on `macos-14` (arm64 `.app.zip`), `macos-13` (x64 `.app.zip`) and `ubuntu-22.04` (`.AppImage` + `.deb`), and attaches them via `gh release upload`.

## Architecture

```
backend/        Bun runtime — Hono server, tRPC, DB, AI shell-out
  ai/           Claude CLI detection + shell-out
  attachments/  image attachment helpers (paired with data/attachments.ts)
  data/         markdown round-trip, backup-on-quit
  db/           Drizzle schema + raw .sql migrations + seed helpers
  http/         Hono route handlers outside tRPC (attachments upload/serve)
  tags/         tag extraction + reconciliation
  trpc/
    routers/    ai, data, entries, profile, search, settings, system, tags
    context.ts  per-request DI (db, raw, dbPath, attachmentsDir, claude)
    router.ts   appRouter merge
    trpc.ts    initTRPC + publicProcedure
  cli.ts        flag parsing (port, open, data-dir, seed-db, clear-db)
  server.ts     createApp(deps) → Hono; serveApp() → Bun.serve handle
  index.ts      prod entry — CLI, db open, sweep, AI detect, serve, shutdown hook
  dev-vite.ts   dev entry — runs init once + exports the Hono app as default
                (consumed by @hono/vite-dev-server)
  staticAssets.generated.ts
                stub in dev; rewritten by scripts/build.ts to embed dist/* assets
                via `with { type: 'file' }` imports, then restored to stub.

frontend/       React 19 + Vite SPA
  App.tsx       wouter routes (Start, Timeline, Settings, Debug)
  pages/        page-level components
  components/   Composer, EntryFeed, JottEditor (TipTap), AiBar, Sidebar, etc.
  lib/          editor (emojiSuggestion, etc.), markdown, useTheme, isTauri
  trpc.ts       @trpc/react-query client wiring against /api/trpc
  styles.css    Tailwind import + app-specific CSS (chips, editor, titlebar)

shared/         pure TS shared between frontend + backend
  tags.ts       tag colour palette + name helpers
  version.ts    single source of truth for the version string

tauri/          Tauri 2 Rust crate `jott`
  src/          window config, sidecar spawn, JOTTAPP_READY parsing
  binaries/     produced sidecars (one per host triple)
  tauri.conf.json   `beforeBuildCommand` = `bun run build:backend`

scripts/        Bun TS automation
  build.ts          builds dist/ + embeds via staticAssets.generated.ts + bun build --compile
  build-sidecar.ts  host-aware Tauri sidecar build (process.platform/arch → triple)
  seed-30d.ts       seeds 30 days of demo entries (people + topics + jotts)
```

**Runtime topology:**

- _Dev:_ a single `bun --bun vite` process. Vite serves frontend + HMR; `@hono/vite-dev-server` loads `backend/dev-vite.ts` and runs the Hono `fetch` handler in-process for `/api/*` and `/healthz`. SQL migrations are loaded by an inline `sqlTextPlugin` in `vite.config.ts` (Vite's SSR loader doesn't understand Bun's `with { type: 'text' }` attribute on its own).
- _Prod (CLI binary):_ `backend/index.ts` parses CLI flags, opens the DB, runs `createApp()`, and starts `Bun.serve` on `127.0.0.1:<port>`. The UI is read from the embedded asset manifest.
- _Prod (Tauri app):_ Rust shell spawns the embedded sidecar binary with `JOTT_BUNDLED=true`, `JOTT_DATA_DIR=<app data dir>`, `JOTTAPP_PORT=0`. The backend prints a `JOTTAPP_READY <url>` sentinel on stdout; Rust parses it and points a WKWebView window at the URL.

## Conventions

- **TS file names:** camelCase for most files (`cli.ts`, `openBrowser.ts`, `paths.ts`, `server.ts`). Kebab-case is used when a name has multiple distinct words and camelCase would hurt readability (`dev-vite.ts`, `build-sidecar.ts`). Match the surrounding directory.
- **React components:** PascalCase `.tsx` files in `frontend/components/` and `frontend/pages/`.
- **Tests:** co-located `*.test.ts` next to the implementation. `import { describe, expect, test } from 'bun:test'`. No `*.spec.ts`.
- **Imports:** prefer the path aliases (`@backend/*`, `@frontend/*`, `@shared/*`) over deep relative paths. `verbatimModuleSyntax` is on, so type-only imports must use `import type { X }`.
- **API surface:** all UI-bound RPCs live under tRPC routers in `backend/trpc/routers/*.ts`. Non-tRPC HTTP (multipart uploads, file streaming) lives in `backend/http/`. Healthcheck stays at `/healthz`.
- **Error handling:** let errors bubble — tRPC has a single high-level error path. Throw `TRPCError` with a code (`PRECONDITION_FAILED`, `NOT_FOUND`, etc.) for user-visible failures. Don't catch-and-log at the procedure level.
- **DB access:** procedures receive `ctx.db` (Drizzle) and `ctx.raw` (the underlying `bun:sqlite` `Database`). Use Drizzle for typed queries; drop to `ctx.raw` for ad-hoc SQL only when Drizzle's surface area is genuinely awkward (e.g. FTS, raw aggregates).
- **IDs:** ULIDs everywhere user-facing (`entries`, `tags`). Generated via the `ulid` package.
- **Tag references in body text:** the canonical on-disk form is `{{ tag id=<ULID> }}`. Display rendering happens in `bodyRendered`. Don't store rendered text in the DB.
- **Commit style:** Conventional Commits (`feat(scope):`, `fix(scope):`, `refactor(scope):`, etc.). Squash-merge so each commit on `main` is one Conventional Commit. **Do not reference Claude / AI / co-authoring in commit messages or PR descriptions** (per the global CLAUDE.md).

## Testing Patterns

- Framework: Bun's built-in test runner (`bun test`). Suite imports come from `bun:test` (`describe`, `test`, `expect`, `beforeEach`, etc.).
- File naming: `<name>.test.ts`, co-located next to `<name>.ts`. No separate `__tests__/` folder.
- Database tests open an in-memory SQLite via `openDb(':memory:')` (the client handles the special path); migrations run at open-time so tests get a real schema, not a mock. **Do not mock the DB layer** — exercising real `bun:sqlite` + Drizzle behaviour is the point.
- tRPC routers are exercised through `createCallerFactory(appRouter)` with a synthesised context built from `makeCreateContext({...})`. See `backend/trpc/routers/*.test.ts` for the pattern.
- Run a subset with `bun test <path>` or `bun test --filter <substring>`.
- The full suite plus lint + format + typecheck runs on every PR; the 5-target Bun binary matrix and a Tauri smoke build (macos-14 + ubuntu-22.04) also gate.

## Key Decisions

ADRs are not kept as standalone files — the long-form rationale lives in `PLAN.md`. Most load-bearing decisions:

- **Single binary via `bun build --compile`** with the UI embedded as `with { type: 'file' }` imports — see `scripts/build.ts` + `backend/staticAssets.generated.ts` (PLAN.md §3 "Binary: `jottapp`").
- **Single-process dev via `@hono/vite-dev-server`** with the Bun adapter, requires `bun --bun vite` so Vite's SSR loader resolves `bun:` scheme imports (PLAN.md §3 "Local web server"). `backend/dev-vite.ts` is the dev-only entry that exports the Hono app.
- **Tauri 2 sidecar pattern** rather than `tauri build`-as-frontend or rewriting the backend in Rust. The Rust shell parses a `JOTTAPP_READY <url>` sentinel from the backend's stdout to decouple itself from backend internals (PLAN.md M9).
- **tRPC over fetch adapter** instead of a hand-rolled REST surface — gives end-to-end types between server routers and React Query hooks (PLAN.md §10).
- **AGPLv3** licence — copyleft, not MIT.

## Gotchas

- **`backend/staticAssets.generated.ts` is a stub in dev.** `scripts/build.ts` rewrites it during a build (`with { type: 'file' }` imports), then restores the stub in a `finally` block — so the working tree always returns to a stub after a successful or failed build. Don't hand-edit it.
- **`bun --bun vite` is mandatory for dev.** Plain `vite` (Node mode) can't resolve `bun:sqlite` imports inside the SSR loader, even with the Bun adapter on `@hono/vite-dev-server`.
- **SQL migration imports.** Files in `backend/db/migrations/*.sql` are imported via Bun's `import x from './foo.sql' with { type: 'text' }`. Vite's SSR transform doesn't understand that attribute, so `vite.config.ts` ships a tiny `sqlTextPlugin` that intercepts `.sql` ids. If you add a new file extension that uses the Bun text-import attribute, extend that plugin.
- **`bun build --compile` leaks temp files.** It drops `.<hex>-<n>.bun-build` artifacts (~63 MB each) into CWD and doesn't always clean them up. `scripts/build.ts` sweeps them in a `finally`. Don't `rm -rf` blindly.
- **Tauri sidecar naming is load-bearing.** The binary must live at `tauri/binaries/jottapp-backend-<CARGO_TRIPLE>` — the exact triple per host is in `scripts/build-sidecar.ts`. Tauri silently drops `externalBin` entries that don't match the host triple.
- **Cargo crate name.** The Tauri crate is `jott`, not the default `app` — this is what makes the macOS Dock and "About / Hide / Quit" menu items say "jott". Don't rename it without updating `Cargo.toml` + the menu strings.
- **Data dir is XDG on macOS too.** `defaultDataDir()` returns `~/.local/share/jottapp` on both Linux and macOS — *not* `~/Library/Application Support`. The Tauri-bundled `.app` overrides with Tauri's standard `app_data_dir()` via `JOTT_DATA_DIR`. CLI users on macOS get the XDG path.
- **Drag region on macOS Tauri.** `.jott-titlebar` calls `window.startDragging()` from an `onMouseDown` rather than relying on `data-tauri-drag-region` — the auto-injected handler is unreliable for `WebviewUrl::External` on macOS 26 Tahoe.
- **PLAN.md is the spec.** Milestones M0–M11 are the source of truth for what's shipped, what's open, and why. Re-read the relevant `Mx` section before doing meaningful work — it's faster than re-deriving from the code.

## Visual identity (palette & typography)

The app has no custom brand colour — it leans on Tailwind defaults so other surfaces (docs, landing page, marketing pages) can match without importing tokens.

- **Surfaces**
  - Light: background `#FFFFFF`, text `#111827` (gray-900).
  - Dark: background `#030712` (gray-950), text `#F3F4F6` (gray-100).
- **Tag accents** (`shared/tags.ts` — the colour each `#topic` / `@person` chip cycles through):
  - Blue `#3B82F6`, Emerald `#10B981`, Amber `#F59E0B`, Red `#EF4444`, Violet `#8B5CF6`, Pink `#EC4899`, Teal `#14B8A6`, Orange `#F97316`.
  - Chips render the accent on a `color-mix(in srgb, <accent> 12%, transparent)` background — a subtle pattern worth echoing in any chip / pill UI.
- **Typography**
  - UI / body: the system UI font stack (Tailwind default — San Francisco on macOS, Segoe UI on Windows, Inter/Roboto as system fallback). No web fonts loaded.
  - Mono (code blocks, kbd, timestamps): `ui-monospace, SFMono-Regular, monospace`.
  - Marketing / landing copy may use a transitional serif for headlines (Source Serif, Newsreader, Lora) to reinforce the journal vibe; the in-app surface stays sans.
- **Theme toggling:** `.dark` class on `<html>`, applied before first paint by an inline boot script in `frontend/index.html` reading `localStorage['jott:theme']` (values: `light` | `dark` | `system`). `frontend/lib/useTheme.ts` is the runtime hook; keep the two in sync if you touch either.

## Notes

- **OS data directories** (CLI / standalone binary): Linux `~/.local/share/jottapp` (`XDG_DATA_HOME` override respected), Windows `%APPDATA%\jottapp`, macOS `~/.local/share/jottapp`. The Tauri `.app` uses Tauri's per-OS app-data dir via `JOTT_DATA_DIR`.
- **`JOTT_BUNDLED=true`** is the env flag that tells the backend it's running inside the Tauri shell — used to suppress misleading hints in Settings (e.g. "Set at startup" on the data-dir field).
- **AI integration is opt-in and local.** `backend/ai/claude.ts` shells out to a `claude` binary discovered on `PATH`. `ai.driver` setting starts empty; the AI bar hides until a driver is picked. There's no remote API call from jott.
- **Releases are unsigned (macOS)** for now — users see the Gatekeeper "unidentified developer" warning. The Release workflow has a clear seam for `APPLE_*` secrets when an Apple Developer ID becomes available.
- **The `init2` skill produced this file.** If the project layout shifts materially, regenerate rather than hand-patching wholesale.
