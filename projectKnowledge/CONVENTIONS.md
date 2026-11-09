# Conventions

## Code
- Readable over clever. Small functions, clear names, early returns. If it needs a comment to be understood, rename or simplify first.
- Comments are rare: only *why* something non-obvious is done (e.g. a numerical-stability trick, a ported formula's source). Never restate the code.
- TypeScript strict, no `any` (use `unknown` + narrowing). Prefer `type`/`interface` data shapes and pure functions; classes only when they hold real state.
- No speculative abstractions: build for the current deliverable.
- Modern APIs only; no deprecated APIs.
- Angular: standalone components, signals, `inject()`, separate `.ts`/`.html`/`.scss`, no inline templates or styles.
- Zod: `import * as z from "zod"`, never `import { z } from "zod"`. The `z` object holds every export, so the bundler keeps all of zod, 64 locales included (304 kB of the app; ADR-038).
- Budgets (`apps/web/angular.json`) are limits, not targets: before raising one, find what grew (`ng build --stats-json`, then sum `bytesInOutput` per input in `dist/web/browser-stats.json`).
- Files: `kebab-case.ts`. Indentation: tabs, width 4 (enforced by `.editorconfig`; YAML/Markdown use 2 spaces).
- Package layout: `src/<concern>/` folders once a package has several concerns (e.g. `schema/`, `io/`, `topology/`; a small package such as `editing` stays flat), one `src/index.ts` public entry for packages. Tests live in `test/` mirroring `src/` (`test/io/parse.test.ts`); shared test circuits in `test/fixtures/` or a `test/support/` helper.
- Units are SI everywhere (volts, amps, ohms, farads, henries, seconds). Name values with units when ambiguous: `stepSeconds`.

## Tests
- Every engine feature ships with golden circuits and tolerances.
- `pnpm test` must pass before a deliverable is marked `done`.

## Git
- Small commits, message format: `D<id>: <what changed>` (work outside a deliverable: `Docs: …`, `Audit: …`, `Backlog: …`).
- No AI `Co-Authored-By` trailers (Claude, Anthropic, or any agent). Enforced by `.githooks/commit-msg` (it matches the common assistant names); `pnpm install` activates it (`core.hooksPath`).
- Parallel agents: one git worktree per agent, one deliverable per worktree.
