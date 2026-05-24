# Architectural Decisions

A running log of the load-bearing decisions for jott. Once recorded, an ADR is immutable — supersede it with a later entry rather than editing in place. New entries get the next number, regardless of topic.

Cross-reference: long-form milestone narrative lives in [`../PLAN.md`](../PLAN.md); operational gotchas live in [`../CLAUDE.md`](../CLAUDE.md).

---

## ADR-001: Bun as the runtime and bundler

**Context:** Need a small dependency surface, fast cold start, and a builder that can produce a single redistributable binary without a separate packager.

**Decision:** Use Bun (≥ 1.3.13) as both the runtime and the bundler. Node is allowed at the tooling edges, but the app — and all `scripts/*.ts` — runs on Bun.

**Consequences:** Free access to `bun:sqlite`, `Bun.serve`, and `bun build --compile`. Dev tooling that runs through Vite must be invoked as `bun --bun vite` so the SSR loader uses Bun's resolver (otherwise `bun:` scheme imports fail).

---

## ADR-002: Single binary via `bun build --compile`, UI assets embedded

**Context:** "One executable, double-click to run" is a non-negotiable distribution shape. We don't want users installing Node, npm, or a Docker daemon.

**Decision:** Build with `bun build --compile`. The Vite-built `dist/` is embedded via auto-generated `with { type: 'file' }` imports in `backend/staticAssets.generated.ts`; that file is a stub in dev and is rewritten + restored by `scripts/build.ts`.

**Consequences:** ~65 MB self-contained binary per OS/arch. The asset manifest must not be hand-edited. `bun build --compile` also leaves `.<hex>.bun-build` temp files in CWD — `scripts/build.ts` sweeps them in a `finally`.

---

## ADR-003: Hono + tRPC over a hand-rolled REST API

**Context:** UI and server share a TypeScript codebase. Hand-rolling routes loses type safety; bringing GraphQL is over-engineered for a single-device journal.

**Decision:** Hono is the HTTP server (it speaks `fetch` natively, pairing well with `Bun.serve`). tRPC is mounted at `/api/trpc` via `@trpc/server/adapters/fetch`. Non-RPC HTTP (multipart uploads, attachment streaming) lives outside tRPC in `backend/http/`.

**Consequences:** End-to-end types between routers and React Query hooks. Errors thrown as `TRPCError` with explicit codes (`PRECONDITION_FAILED`, `NOT_FOUND`, etc.); single high-level error path.

---

## ADR-004: `bun:sqlite` + Drizzle for the database

**Context:** Local-only storage requires an embedded database; SQLite is the obvious shape. We want typed queries without an ORM that takes over migrations.

**Decision:** `bun:sqlite` for the driver, Drizzle (`drizzle-orm/bun-sqlite`) for typed reads/writes, raw `.sql` files for migrations. WAL mode + `foreign_keys = ON` set in `openDb()`.

**Consequences:** Migrations are imported via Bun's `with { type: 'text' }` text-import attribute — Vite's SSR loader needs the inline `sqlTextPlugin` to handle them during dev. Procedures get both `ctx.db` (Drizzle) and `ctx.raw` (the raw driver) so ad-hoc SQL (FTS, aggregates) stays ergonomic.

---

## ADR-005: ULIDs for entity IDs

**Context:** Sequential auto-increment IDs leak ordering and don't merge cleanly if sync is ever added. UUIDs are random but not lexicographically ordered.

**Decision:** ULIDs for every user-facing entity (`entries`, `tags`). Generated via the `ulid` package.

**Consequences:** IDs sort by creation time, making range queries and pagination natural. Sync-ready without a schema rewrite later.

---

## ADR-006: Markdown is the canonical body; tags are `{{ tag id=<ULID> }}` tokens

**Context:** TipTap's internal JSON would lock content into one editor and obscure it on disk. Plain Markdown loses tag references when a tag is renamed.

**Decision:** Persist entry bodies as Markdown. Tag references in the body are stored as `{{ tag id=<ULID> }}` placeholders; the rendered display text (`bodyRendered`) is computed on read. The `entry_tags` join table is derived state — any edit resyncs.

**Consequences:** Tag renames propagate to every entry without rewriting their bodies. Markdown export/import remains lossless because the `{{ tag id=… }}` form survives a round-trip and reconciles back to the canonical store.

---

## ADR-007: React 19 + Vite 8 + Tailwind v4 for the frontend

**Context:** Need an SPA that builds fast, embeds into the binary as static files, and supports light/dark with no flash.

**Decision:** React 19 (server components not used — single-binary serves a static SPA), Vite 8 as the bundler, Tailwind v4 via `@tailwindcss/vite` (the CSS-first config, no `tailwind.config.js`), wouter for routing.

**Consequences:** Tailwind utility class names are stable across the app; no custom design tokens — the palette draws from Tailwind defaults (`gray-900` / `gray-950` for surfaces) plus the eight tag accents in `shared/tags.ts`.

---

## ADR-008: TipTap for the editor

**Context:** Need a rich-text editor with controlled marks, custom node types (image, task list), and Markdown round-trip — without rebuilding ProseMirror from scratch.

**Decision:** TipTap 3 with a curated extension set (StarterKit + Link, Image, Placeholder, TaskList/TaskItem, Emoji). Markdown round-trips via TipTap's serializer extended in `frontend/lib/markdown/`.

**Consequences:** Pinned to the TipTap ecosystem for the editor surface. Custom nodes (e.g. image attachment uploads) live in `frontend/components/ImageUploadNode.tsx`.

---

## ADR-009: Biome (not ESLint + Prettier) for lint and format

**Context:** ESLint + Prettier means two configs, two CI jobs, two `--write` invocations. Biome covers both with a single tool.

**Decision:** Biome `^2.4` for both lint (`bun run lint`) and format (`bun run format`). Single quotes, trailing-all commas, semicolons, 100-char line width, 2-space indent.

**Consequences:** A single `biome.json` instead of three config files. If Biome ever lacks a rule we need, escape hatch is to layer ESLint on top — but we haven't needed to.

---

## ADR-010: Single-process dev via `@hono/vite-dev-server` (Bun adapter)

**Context:** Running Vite and the Hono server as two separate processes complicates the dev experience (port collisions, dual logs, proxy config). Initial assumption was that `@hono/vite-dev-server` couldn't load `bun:sqlite` through Vite's SSR transform.

**Decision:** Use `@hono/vite-dev-server` with the Bun adapter; require `bun --bun vite` to ensure Vite's SSR loader runs on Bun (which resolves `bun:` scheme imports). The dev entry is `backend/dev-vite.ts`, which exports the Hono app as default after one-time init.

**Consequences:** Single process for the entire dev loop. `vite.config.ts` ships an inline `sqlTextPlugin` to translate `with { type: 'text' }` SQL imports for Vite's SSR loader.

---

## ADR-011: Tauri 2 sidecar pattern for the native macOS app

**Context:** Three options for the desktop shape: Electron (heavy, full Node runtime), Tauri-as-frontend (rewrite backend in Rust), or Tauri-as-shell-around-the-Bun-binary (sidecar). The Bun binary already works headlessly — duplicating it in Rust is wasted work.

**Decision:** Tauri 2 sidecar pattern. Rust spawns the embedded Bun binary as an `externalBin`; the WKWebView window points at the URL the backend prints. The Cargo crate is named `jott` (not the default `app`) so macOS Dock + menus pick up the right name.

**Consequences:** One backend implementation serves both the CLI and the `.app`. Sidecar binaries must be named `tauri/binaries/jottapp-backend-<CARGO_TRIPLE>` — Tauri silently drops mis-named entries. `scripts/build-sidecar.ts` detects host triple per CI runner so each platform builds its own sidecar natively.

---

## ADR-012: `JOTTAPP_READY <url>` stdout sentinel for the Rust ↔ Bun handshake

**Context:** The Tauri shell needs to know the URL the backend bound (port could be `0`/OS-assigned), and Rust shouldn't depend on backend internals.

**Decision:** The Bun backend writes a single line `JOTTAPP_READY <url>` to stdout once `Bun.serve` is up; Rust parses stdout for that sentinel and constructs the window from the parsed URL.

**Consequences:** Decoupled — backend can change ports, switch interfaces, or be replaced wholesale without touching the Rust shell. The sentinel is part of the contract; don't change its shape.

---

## ADR-013: Bind to `127.0.0.1` only, no auth

**Context:** This is a personal-use single-device app. Network exposure widens the attack surface for zero user benefit.

**Decision:** `Bun.serve` always binds to `127.0.0.1`, never `0.0.0.0`. No authentication layer — the loopback boundary is the trust boundary.

**Consequences:** Cannot reach jott from another device on the LAN by accident. If remote access ever becomes a feature, that's a deliberate addition (auth + bind change together), not an accident.

---

## ADR-014: Port lock as single-instance guard, no daemon

**Context:** Could implement a PID-file or a Unix socket to detect a running instance; both add lifecycle complexity.

**Decision:** Fixed default port `4853`. If the port is taken, the second instance fails to start with a clear message. No daemonisation, no `--background` flag, no PID files.

**Consequences:** Single-instance is enforced implicitly. `Ctrl+C` is the only stop mechanism (foreground process). Users who want to run jott in the background reach for their OS's standard tools (`launchd`, `systemd`, `&`).

---

## ADR-015: AGPLv3 licence

**Context:** Permissive licences (MIT/Apache) allow downstream forks to ship modifications without contributing back. Copyleft (GPL/AGPL) requires source distribution.

**Decision:** AGPLv3 — strongest copyleft, covers the network-service case (anyone hosting a modified jott must publish their changes).

**Consequences:** Friendly for personal use, contributions, and forks; deliberately unfriendly for closed-source commercial relicensing. Any future commercial-friendly story will need a dual-licence agreement, not a permissive base.

---

## ADR-016: macOS release artifacts ship as zipped `.app`, not `.dmg`

**Context:** `.dmg` is the conventional macOS distribution wrapper but adds bundle time and is heavier than a plain bundle. `.app` is a directory bundle and can't be uploaded raw.

**Decision:** Release workflow narrows Tauri to `--bundles app` (skips dmg). `ditto -c -k --sequesterRsrc --keepParent` zips the `.app` directory (preserves extended attributes / code-sign metadata, unlike a plain `zip`). Output: `jott-<TRIPLE>.app.zip`.

**Consequences:** Smaller, faster release builds. Users unzip and drag-to-Applications themselves instead of mounting a DMG. When code signing arrives, the `.app.zip` form already preserves the metadata signing relies on.
