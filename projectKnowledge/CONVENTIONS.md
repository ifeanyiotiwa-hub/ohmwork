# Conventions

## Code
- Readable over clever. Small functions, clear names, early returns. If it needs a comment to be understood, rename or simplify first.
- Comments are rare: only *why* something non-obvious is done (e.g. a numerical-stability trick, a ported formula's source). Never restate the code.
- TypeScript strict, no `any` (use `unknown` + narrowing). Prefer `type`/`interface` data shapes and pure functions; classes only when they hold real state.
- No speculative abstractions: build for the current deliverable.
- Modern APIs only; no deprecated APIs.
- Angular: standalone components, signals, `inject()`, separate `.ts`/`.html`/`.scss`, no inline templates or styles.
- Files: `kebab-case.ts`. Tests sit next to code: `thing.test.ts`.
- Units are SI everywhere (volts, amps, ohms, farads, henries, seconds). Name values with units when ambiguous: `stepSeconds`.

## Tests
- Every engine feature ships with golden circuits and tolerances.
- `pnpm test` must pass before a deliverable is marked `done`.

## Git
- Small commits, message format: `D<id>: <what changed>`.
- Parallel agents: one git worktree per agent, one deliverable per worktree.
