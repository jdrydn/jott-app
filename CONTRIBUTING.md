# Contributing

Thanks for poking at jott! This document covers the tooling and workflow you'll need to make changes.

## Required tooling

- **Bun** `≥ 1.3.13` — runtime + package manager. The exact version is pinned via `packageManager` in `package.json`. Install: <https://bun.sh>.
- **Node** `≥ 24` — only used by some toolchain bits; Bun handles the runtime.
- **Rust** (stable toolchain via `rustup`) — required if you'll touch the Tauri shell or run `bun run tauri:*` scripts.
- **Linux only, for the Tauri shell:**
  ```sh
  sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev patchelf
  ```

## Installing dependencies

```sh
bun install
```

CI uses `bun install --frozen-lockfile` — keep `bun.lock` committed and in sync with `package.json`.

### Adding new dependencies

```sh
bun add <pkg>          # runtime dependency
bun add -d <pkg>       # dev dependency
```

- Always commit `bun.lock` alongside the `package.json` change.
- Prefer staying inside the existing ecosystems (Hono, TipTap, Drizzle, tRPC) before introducing a new one — the binary stays smaller and the dev surface stays familiar.
- Avoid CommonJS-only packages where possible; Vite's SSR loader needs ESM-friendly modules during dev.

## Working locally

```sh
bun run dev
```

Boots a single Vite process that serves the frontend at <http://127.0.0.1:4853> and runs the Hono backend in-process via `@hono/vite-dev-server` (Bun adapter). HMR works for both sides; the dev DB lives at `./.jott-dev/jottapp.db` (override with `JOTT_DATA_DIR=…`).

- `bun run dev:seed` — same as `dev`, but seeds demo data on first boot if the DB is empty.
- `bun run dev:backend` — runs the standalone backend (`bun --watch backend/index.ts`) if you want to exercise the prod-style server without Vite in the loop.

### Linting & Typechecks

[Biome](https://biomejs.dev) handles both lint and format; `tsc` handles types.

```sh
bun run lint           # biome check .
bun run lint:fix       # auto-apply fixable lints
bun run format         # biome format --write .
bun run format:check   # CI-style format verification
bun run typecheck      # tsc --noEmit
```

All four are gated by CI on every PR.

### Unit Tests

```sh
bun test
```

- Uses Bun's built-in test runner — no separate jest/vitest config to wrangle.
- Convention: `foo.test.ts` lives next to `foo.ts` (e.g. `backend/cli.test.ts`, `shared/tags.test.ts`).
- Keep tests fast and hermetic; the suite runs on every PR.

### Running the app locally

| Goal | Command | Notes |
| --- | --- | --- |
| Web dev loop | `bun run dev` | Vite + Hono, port 4853 |
| Native shell dev (macOS) | `bun run tauri:dev` | Opens the WKWebView pointing at the Vite dev server |
| Compiled binary, prod-style | `bun run build` then `./jottapp` | Single-file output via `bun build --compile` |
| Native macOS `.app` | `bun run tauri:build` | Outputs to `tauri/target/release/bundle/` |

## Pull Requests

- Branch off `main`. Use a descriptive prefix: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): …`, `fix(scope): …`). The PR title should match the same style — squash-merge uses it verbatim.
- Fill out the PR template (Summary / References / How to test / Further details).
- Keep PRs focused — one logical change per PR. Drive-by refactors land in their own PR.
- CI must be green before review: `lint`, `format:check`, `typecheck`, `test`, the 5-target Bun binary matrix, and the Tauri smoke build (macOS arm64 + Linux x64).

### Approvals

jott is a single-maintainer project right now — [@jdrydn](https://github.com/jdrydn) reviews and approves every PR. External contributors should expect a round of feedback before merge.

### Merging

- **Squash & merge** is the default. It keeps `main` linear and ensures every commit on `main` is a Conventional Commit.
- Delete the branch after merge — the Release workflow is independent and doesn't rely on branch history.
- Releases are cut by drafting a release in the GitHub UI and clicking _Publish_. The `Release` workflow then attaches `.app.zip` (macOS) / `.deb` (Linux) bundles to that release; no manual upload step.
