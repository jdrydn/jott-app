# jott-app — Plan

> "Jot it down" — standalone, offline-first, timestamped journal application.
> Single-binary CLI that bundles a local web UI. Electron later, maybe.

Source of truth for what we're building, why, and in what order. Open questions live at the bottom until resolved, then move into the relevant section. A running decisions log lives at the end.

---

## 1. Vision

A frictionless personal journal where every **entry** is timestamped at creation. One binary, `jottapp`. Run it; it starts a local web server and opens your browser to a focused editor. Shells out to `claude` for summarisation/reflection.

(The verb stays "jot it down" — the brand. The data primitive is `Entry`.)

**Shape v1:** single Bun-compiled binary, ships its own web server + bundled UI. Web UI is the only interface.
**Shape v2 (later, optional):** wrap the same web UI in Electron for native install / system tray / auto-update.
**Shape v3 (later, optional):** add CLI subcommands (`jottapp new`, `jottapp list`, etc.) for terminal-native capture and scripting.

**Anti-goals:**
- Not Notion / Obsidian (no nested pages, wikilinks, databases)
- Not a task manager (no todos, reminders, scheduling)
- Not collaborative (single-user, single-device)
- Not a SaaS (no cloud-hosted version — the binary _is_ the product)
- Not a CLI tool in v1 (CLI subcommands are an explicit future milestone, not the focus)

---

## 2. Core principles

1. **Offline-first, always.** Fully usable with zero network. The `claude` integration is the only optional online feature.
2. **Zero friction to write.** `jottapp` → server starts → browser opens → focused editor.
3. **Append-only-feeling.** Entries are timestamped at creation. Edits allowed; timestamp is the entry's identity.
4. **Durable & portable.** SQLite file you can copy. Plain markdown export. No lock-in.
5. **Small, boring, fast.** Minimal stack. Single binary. Ship.
6. **OSS, releasable.** Tests, docs, CI from day one.

---

## 3. Shape

### Binary: `jottapp`

One command. Flags, no subcommands.

```sh
jottapp                       # start server, open browser
jottapp --port 4853           # override port (default: 4853)
jottapp --no-open             # don't auto-open browser
jottapp --db /path/to.db      # override DB location
jottapp --version
jottapp --help
```

### Local web server

- **Framework:** Hono, running on Bun.
- **API layer:** tRPC mounted at `/api/trpc` (via Hono adapter), end-to-end typesafe between server router and React client.
- Binds to `127.0.0.1` only (never `0.0.0.0`).
- **No auth** — pure trust-the-loopback. Personal-use single-device app.
- Fixed default port `4853`. If taken, **fail to start** with a clear message ("port 4853 in use — is `jottapp` already running?"). No fallback.
- **In production:** Hono serves the pre-built React app as static assets, embedded into the compiled binary via `bun build --compile`.
- **In development:** Hono mounts the Vite dev server as middleware (`createServer({ server: { middlewareMode: true } })`) so the API and frontend share one origin, one port, and HMR just works.
- Lifecycle: foreground process. `Ctrl+C` to stop. No daemon mode.
- Single-instance is implicitly handled by the port lock — a second `jottapp` will fail to bind.

### Distribution

- Single executable per OS: macOS arm64/x64, Linux x64/arm64, Windows x64.
- GitHub Releases.
- Homebrew tap (`brew install jdrydn/jott/jottapp`) — eventually.
- `npm i -g jottapp` as a fallback channel.

---

## 4. Data model

Primary entity: **Entry** (a journal entry). **Tag** is a normalized, reusable label with a type (`topic` for `#hashtags`, `user` for `@mentions`) and visual properties (initials, colour). Entries link to tags via a join table.

Schemas are sync-ready (ULIDs, soft deletes, `updatedAt`) even though sync is out of scope — keeps the door open.

```ts
type Entry = {
  id: string;          // ULID
  createdAt: number;   // epoch ms, immutable, the entry's identity
  updatedAt: number;   // epoch ms, bumped on edit
  body: string;        // markdown source (no headings; bold/italic/lists/code/links/blockquote/etc)
  deletedAt?: number;  // soft delete
};

type Tag = {
  id: string;          // ULID
  type: 'topic' | 'user';  // topic = #hashtag, user = @mention
  initials: string;    // short label for chips/avatars, e.g. "JD", "WK"
  name: string;        // display name, e.g. "James Doe", "Work"
  color: string;       // hex, e.g. "#3B82F6"
  createdAt: number;
  updatedAt: number;
};

type EntryTag = {           // many-to-many join
  entryId: string;
  tagId: string;
  nameWhenLinked: string;   // literal token from body at link-time (e.g. "old-name").
                            // Never mutated on Tag rename — lets the renderer match
                            // body tokens to the right row and substitute current Tag.name.
  createdAt: number;        // when this tag was first applied to this entry
};

type Profile = {
  id: 'me';            // singleton row
  name: string;        // "James" — for "Hello James"
  theme?: 'light' | 'dark' | 'system';
  createdAt: number;
};

type Setting = {
  key: string;         // "claude.binary", "db.path", "server.port", "editor", ...
  value: string;
};
```

### Tag extraction & lifecycle

- Editor scans body for `#word` (Topic) and `@word` (User) tokens at write-time.
- On save, the backend:
  1. Tokenises the body for tag references.
  2. Upserts `tags` rows by `(type, name)` — first sighting creates the tag with a default colour + initials derived from name.
  3. Reconciles `entry_tags` for that entry (insert new links with `nameWhenLinked = token`, remove links no longer present in body).
- **Body is the source of truth.** `tags` + `entry_tags` are derived/cached state. Any edit resyncs.
- Tag colour/initials editable later from a Tags settings screen (defer to M3+).

### Tag delete (cascade)

- Deleting a Tag cascade-deletes its `entry_tags` rows.
- Entry bodies still contain the literal `#word` / `@word` text. The frontend must render these gracefully as **"broken" tags** — plain text or muted styling, never crash, never a dead chip.
- A subsequent edit to the body that retains the token re-creates the Tag (auto-extraction) and re-establishes the link.

### Tag rename (display swap)

- Renaming a Tag updates `tags.name` only. Body text and `entry_tags.nameWhenLinked` are untouched.
- On render, the frontend:
  1. Finds each `#word` / `@word` token in the body.
  2. Looks up the matching `entry_tags` row by `nameWhenLinked = word`.
  3. Renders the chip using the Tag's _current_ `name`, `initials`, `color`.
- Result: rename a Tag once, every historical entry shows the new name without rewriting bodies.
- Markdown export emits literal body text (not current Tag.name) — body is canonical.

### Initials defaults

When a Tag is auto-created, initials are derived from name:
- Multi-word: first letter of each word, capped at 2 words → `"James Doe"` → `JD`, `"work project alpha"` → `WP`.
- Single-word: first two letters → `"work"` → `WO`, `"james"` → `JA`.
- Always editable later in the Tags settings screen.

### Visual treatment

- `#topic` and `@user` tokens render inline as styled chips using the tag's colour.
- Topic tags use a `#` sigil + colour-tinted background; User tags use the `initials` (avatar-style) + `@name`.
- The TipTap extension reads the same regex as the backend extractor, so the editor and storage stay in lockstep.

### IDs

Hidden in the web UI entirely — implementation detail for the data layer.

---

## 5. Storage

- **Engine:** SQLite.
- **Driver:** `bun:sqlite` (Bun built-in).
- **ORM / query builder:** Drizzle (`drizzle-orm/bun-sqlite`). Schemas defined in TS, queries fully typed.
- **DB location:** `$XDG_DATA_HOME/jottapp/jottapp.db` (Linux/macOS) or `%APPDATA%\jottapp\jottapp.db` (Windows). Overridable via `JOTTAPP_DB` env or `--db` flag.
- **Schema:** `entries`, `entry_fts` (FTS5 virtual table over `entries.body`), `tags`, `entry_tags` (join), `profile`, `settings`.
- **Migrations:** `PRAGMA user_version` pattern with one `.sql` file per version. Migrations live in `backend/db/migrations/0001_init.sql`, `0002_*.sql`, etc. A `migrations/index.ts` statically imports each as a raw string (Vite/Bun support `?raw`) and exports them in order — so `bun build --compile` embeds them automatically, no runtime folder reads. Runner (~15 LOC): read `PRAGMA user_version`, apply newer migrations in order, bump `user_version` after each. Drizzle owns query building; we own migration application.

Future Electron migration: Drizzle schema is portable; swap `drizzle-orm/bun-sqlite` for `drizzle-orm/better-sqlite3`. Same SQL, same types.

Encryption is deferred — relying on OS disk encryption (FileVault / BitLocker / LUKS) for v1.

---

## 6. UI (web app, bundled in binary)

- **Framework:** React 18 + TypeScript + Vite (dev), bundled into the binary for prod.
- **Styling:** Tailwind CSS.
- **Editor:** TipTap (ProseMirror), restricted to allowed marks/blocks:
  - bold, italic, strikethrough
  - inline code, code blocks
  - ordered + unordered lists, task lists
  - links
  - blockquotes
  - horizontal rules
  - **no headings**, **no tables** (revisit later)
- **Tag highlighting:** TipTap extension that detects `#word` (Topic) and `@word` (User) tokens and styles them with each tag's colour/initials. Uses the same regex as the backend extractor so editor + storage stay in lockstep.
- **Markdown:** TipTap (de)serialises to markdown for storage. Round-trip tested.
- **Routing:** TBD — likely a small client-side router for `/`, `/entries/:id`, `/search`, `/settings`. Defer until M2.
- **Layout:** mobile-first responsive — desktop is primary, phone/tablet works through the browser.
- **No auth on the local server** for v1, bind to 127.0.0.1.

---

## 7. AI integration (Claude shell-out)

- The server shells out to the `claude` binary when the UI calls an AI tRPC procedure.
- **Startup check:** on boot, the server probes for `claude` on PATH. If not found, AI procedures return a "disabled" status (queryable via `ai.status`); UI shows AI controls as greyed-out with an explanatory tooltip.
- **tRPC procedures (v1) — `ai.*` router:**
  - `ai.status`     — query: is `claude` available?
  - `ai.summarise`  — mutation: date-window TL;DR
  - `ai.reflect`    — mutation: themes/patterns
  - `ai.ask`        — mutation: Q&A over a slice
- **Config (stored in `settings` table):**
  - `claude.binary` — defaults to `claude` on PATH
  - `claude.model` — optional pass-through
  - `claude.maxEntries` — token-cost safety cap
- **Privacy:** AI features send journal content to Anthropic via `claude`. Opt-in by virtue of being a separate UI button. Default capture/read flow stays 100% local. UI shows a one-liner near AI controls explaining this.

---

## 8. Personalisation

No auth. A local `profile` row holds name + preferences. First time the UI loads with no profile, it shows an onboarding screen asking for the user's name. After that, the UI header shows "Hello $name".

```
$ jottapp
jottapp v0.1.0 — http://127.0.0.1:4853 (opening browser…)
Press Ctrl+C to stop.
```

---

## 9. Milestones

Gated — each leaves a working, runnable binary.

### M0 — Hello server (weekend prototype)
- Bun project scaffold, TS strict
- Drizzle + `bun:sqlite` wired up, first migration (`entries` table)
- Hono on `127.0.0.1:4853`, fails if port taken
- tRPC mounted at `/api/trpc` with `entries.list` + `entries.create` procedures
- Hono mounts Vite dev server in dev mode (one origin, HMR works)
- Minimal React + Tailwind app: list of entries + plain `<textarea>` to add, talking to tRPC via `@trpc/react-query`
- `jottapp` boots server + auto-opens browser
- `bun build --compile` produces a single binary with UI assets embedded
- CI: lint, typecheck, test, build matrix
- **Goal:** prove single-binary + server + DB + UI + typed-API pipeline end-to-end.

### M1 — Rich editor + tags
- TipTap with the allowed mark set (§6)
- Markdown serialize on save, parse on load
- Round-trip tests (golden files)
- Tag extraction (`#topic`, `@user`) on save → `tags` + `entry_tags` reconciliation
- Tag highlighting in editor (chip rendering with colour/initials)

### M2 — Capture polish + Discover
- Autosave (debounced) — no save button
- Edit / soft-delete / restore (in UI)
- FTS5 search bar
- Date-range filter, tag filter (by tag chip)
- Day/week grouping in list view

### M3 — Config & profile
- First-run onboarding screen (asks name)
- "Hello $name" header
- Settings screen: name, theme, db path, claude binary
- `settings` table behind it

### M4 — AI integration
- tRPC `ai.*` router: `status`, `summarise`, `reflect`, `ask`
- UI buttons in the list/detail views, gated by `ai.status`
- Startup detection of `claude` on PATH; graceful disable when missing
- Token-cap safety

### M5 — Durability
- Export to markdown bundle (UI button)
- Import (UI flow)
- Backup-on-quit (configurable)

### M6 — Image attachments
- `attachments` table FK'd to entries: `id`, `entryId`, `kind: 'image'`, `path`, `mime`, `width`, `height`, `createdAt`
- Files stored on disk under the app data dir (not in SQLite) — keeps DB lean
- TipTap paste + drag-drop into the editor
- Markdown export embeds images alongside (relative paths or `data:` URIs — TBD at the time)
- Future-proofed for non-image kinds (voice, files) without further schema work

### M7 — Release prep
- Cross-compile binaries (macOS arm64/x64, Linux x64/arm64, Windows x64)
- GitHub Releases via Actions
- Homebrew tap
- `npm i -g jottapp` channel
- README polish, `--help` quality, a simple landing page

### M8 — Electron wrapper (long-haul stretch)
- Wrap the same web app in Electron for native install + tray + auto-update
- Swap Drizzle driver from `bun-sqlite` → `better-sqlite3` (one import change, schema unchanged)
- Hono runs under Node inside Electron's main process, serves the same renderer

### M9 — CLI subcommands (long-haul stretch)
- `jottapp new`, `jottapp list`, `jottapp ai *`, `jottapp export`, `jottapp tags` etc.
- Reuses the existing core; just adds a command router on top
- Useful for quick capture from terminal + scripting

### M-future — sync, mobile, encryption
- Re-evaluate once v1 is in your hands.

---

## 10. Tooling baseline

- **Lang:** TypeScript (strict)
- **Runtime / builder:** Bun (`bun build --compile`)
- **Server:** Hono
- **API:** tRPC + `@trpc/server`'s fetch adapter (Hono speaks fetch natively)
- **DB:** `bun:sqlite`
- **ORM:** Drizzle (`drizzle-orm/bun-sqlite` + `drizzle-kit` for migrations)
- **UI framework:** React 18, Vite, Tailwind CSS
- **UI data fetching:** `@trpc/react-query` (React Query under the hood)
- **Editor:** TipTap
- **Markdown:** TipTap's built-in serializer + `marked` for any one-shot rendering needs
- **CLI args:** hand-rolled flag parsing (only `--port`, `--no-open`, `--db`, `--version`, `--help`). Subcommand router deferred to M8.
- **Testing:** `bun test` (unit), Playwright (e2e against the web UI in M1+)
- **Lint/format:** Biome (faster, single tool) — or ESLint + Prettier if Biome lacks something we need
- **CI:** GitHub Actions — lint, typecheck, test, build matrix
- **Releases:** GitHub Releases + Bun cross-compile
- **Commits:** Conventional Commits

---

## 10a. Project structure (proposed)

Single package. `backend/` and `frontend/` at the root, no `packages/` wrapper. `shared/` at the root for the tiny bit of code (hashtag regex) genuinely used by both.

```
/
├── backend/
│   ├── index.ts                # Hono app entry, port bind, browser open
│   ├── dev.ts                  # mounts Vite middleware in dev mode
│   ├── trpc/
│   │   ├── context.ts          # creates per-request ctx (db handle, etc.)
│   │   ├── router.ts           # root AppRouter (exported as `type` to frontend)
│   │   └── routers/
│   │       ├── entries.ts
│   │       ├── tags.ts
│   │       ├── profile.ts
│   │       ├── settings.ts
│   │       └── ai.ts
│   ├── db/
│   │   ├── client.ts           # drizzle({ client: new Database(path) })
│   │   ├── schema.ts           # Drizzle table defs (single source of truth)
│   │   ├── migrate.ts          # ~15-LOC runner using PRAGMA user_version
│   │   └── migrations/
│   │       ├── index.ts        # static `?raw` imports, ordered array of SQL
│   │       ├── 0001_init.sql
│   │       └── ...
│   └── ai/
│       └── claude.ts           # shell-out helpers, PATH detection
├── frontend/
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── trpc.ts                 # createTRPCReact<AppRouter>()
│   ├── components/
│   ├── pages/
│   └── styles/
├── shared/
│   └── tags.ts                 # hashtag regex — used by editor + backend
├── drizzle.config.ts
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── PLAN.md
```

`frontend` imports `type AppRouter` from `backend/trpc/router.ts` — that's the only `frontend → backend` coupling, and it's type-only (erased at runtime). Path aliases `@backend/*`, `@frontend/*`, `@shared/*` in `tsconfig.json` + `vite.config.ts`.

---

## 11. Open questions

_(Open questions section is empty — all resolved. New ones land here.)_

---

## 12. Decisions log

| Date       | Decision                                                                  | Rationale                                                                  |
| ---------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-05-13 | Desktop primary, mobile-first responsive web UI                           | User intent — primary use at keyboard, phone usable via browser            |
| 2026-05-13 | SQLite as storage engine                                                  | User decision — over IndexedDB                                             |
| 2026-05-13 | No sync, single-device — schema kept sync-ready (ULID, soft deletes)      | Scope control; leaves door open                                            |
| 2026-05-13 | Markdown storage; rich-text editor (TipTap) in web UI                     | "Editor matters"; portable; no lock-in                                     |
| 2026-05-13 | No headings; allow bold/italic/lists/code/links/blockquote                | Flat journal, not document tool                                            |
| 2026-05-13 | No auth; local profile row for personalisation                            | Single device, but greet the user                                          |
| 2026-05-13 | OSS, releasable; tests + docs + CI from day one                           | Long-haul intent                                                           |
| 2026-05-13 | Aim: weekend prototype first, long-haul project after                     | De-risk architecture before investing in polish                            |
| 2026-05-13 | TypeScript-only stack (no Rust)                                           | User direction; keep stack uniform                                         |
| 2026-05-13 | Encryption deferred                                                       | User direction; OS disk encryption is enough for v1                        |
| 2026-05-13 | AI features via shell-out to `claude` CLI                                 | Zero dep on Anthropic SDK; reuses user's existing auth                     |
| 2026-05-13 | Runtime: Bun                                                              | TS-native, single-binary compile, `Bun.serve`, fast startup                |
| 2026-05-13 | Binary name: `jottapp`                                                    | Matches "Jott App" branding; no collision with macOS BSD `jot`             |
| 2026-05-13 | Claude detection: assume on PATH; disable AI features if missing          | Friction-free for users who have it, graceful for those who don't         |
| 2026-05-13 | Tags: auto-extracted from `#word` tokens in body; editor highlights them  | Zero-friction tagging; same regex in CLI + UI                              |
| 2026-05-13 | IDs hidden in UI; hidden in CLI by default (`--ids` to reveal 8-char)     | Cleaner ergonomics; IDs are an implementation detail                       |
| 2026-05-13 | UI styling: Tailwind                                                      | Fast, boring, well-trodden                                                 |
| 2026-05-13 | **Shape:** single binary that bundles a local web server + UI            | User direction; clean migration path to Electron later                     |
| 2026-05-13 | SQLite via `better-sqlite3` (not `bun:sqlite`)                            | Works in Bun AND Node — survives a future Electron migration unchanged    |
| 2026-05-13 | Electron is deferred (M7), not v1                                         | Web-server shape covers v1; Electron later if we want native install UX    |
| 2026-05-13 | No localhost auth — pure trust-the-loopback                               | Single-device personal app; auth would be UX cost with no real threat      |
| 2026-05-13 | Fixed port 4853; fail to start if taken (no fallback)                     | Predictable, bookmarkable; failure mode is clear ("already running?")      |
| 2026-05-13 | v1 = `jottapp serve` only; no CLI subcommands                             | Web UI is the only interface in v1; subcommand router deferred to M8       |
| 2026-05-13 | Backend: Hono on Bun                                                      | Lightweight, fetch-native, runs anywhere — survives Electron migration     |
| 2026-05-13 | API: tRPC at `/api/trpc` (fetch adapter), React Query on the client          | End-to-end typesafe; zero schema duplication between server and UI         |
| 2026-05-13 | Dev: Hono mounts Vite dev server as middleware                           | One origin, one port, HMR works — best DX                                  |
| 2026-05-13 | DB: `bun:sqlite` + Drizzle (overrides earlier `better-sqlite3` decision)  | User direction; Drizzle schema is portable, Electron migration = driver swap |
| 2026-05-13 | Migrations: `PRAGMA user_version` + one `.sql` file per version           | Native SQLite pattern; each migration runs exactly once; clean git history  |
| 2026-05-13 | Project layout: `backend/` + `frontend/` + `shared/` at repo root        | Clear split, no monorepo tooling overhead, type-only coupling via tRPC      |
| 2026-05-13 | Rename `Jot` → `Entry` as the primary data primitive                      | "Jot it down" is the verb/brand; "entry" is the noun. Cleaner semantics    |
| 2026-05-13 | Tags normalised into a `tags` table + `entry_tags` join                   | Reusable styling (colour, initials), supports both `#topic` and `@user`     |
| 2026-05-13 | Tag types: `topic` (#) and `user` (@)                                     | Two distinct sigil-based conventions, distinct visual treatment             |
| 2026-05-13 | No tables in editor for v1                                                | Entries are short; clashes with flat-journal shape                          |
| 2026-05-13 | No attachments in v1; images planned as a future feature                  | Confirmed future direction; defer concrete shape until v1 ships             |
| 2026-05-13 | Tag delete = cascade; frontend handles broken tags gracefully             | Body is source of truth; tokens self-heal on next edit                      |
| 2026-05-13 | Tag rename updates Tag row only; frontend swaps display via `nameWhenLinked` | Single rename propagates to all historical entries without rewriting bodies |
| 2026-05-13 | Added `entry_tags.nameWhenLinked` to support rename-on-display            | Enables matching body tokens to the right Tag row after rename              |
| 2026-05-13 | Initials default: first letter per word (cap 2); single-word → first 2 letters | Deterministic, editable later from Tags settings                       |
| 2026-05-13 | Topic + User unified into single Tag model with `type` discriminator      | No separate Person model needed; sigil distinguishes type at parse-time     |
| 2026-05-13 | Images = M6 (between Durability and Release prep); other milestones pushed | Confirmed future direction worth doing pre-1.0; non-image attachments deferred |
| 2026-05-13 | Markdown export: emit literal body text (do not resolve tag renames)      | Body is source of truth; rename is a display-time concern only             |
