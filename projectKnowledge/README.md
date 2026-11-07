# projectKnowledge

Single source of truth for humans and agents. Read in this order before doing any work:

1. `HANDOVER.md`: current state, what's next, what's blocked. **Start here.**
2. `DELIVERABLES.md`: milestones, acceptance criteria, status.
3. `ARCHITECTURE.md`: layers, boundaries, and the rules that keep them clean.
4. `CONVENTIONS.md`: how code is written here.
5. `DECISIONS.md`: why things are the way they are. Don't re-decide without a new entry.
6. `VISION.md`: what we're building and for whom.
7. `GLOSSARY.md`: circuit terms in plain language.
8. `COMPONENTS.md`: every supported/planned part, and the checklist for adding one.

## Rules for every agent session
- Before starting: read `HANDOVER.md` and claim one deliverable (set its status to `in-progress` with your agent/session name).
- One agent per deliverable. Parallel agents work on different packages, each in its own git worktree.
- After finishing, or before stopping for any reason: update `HANDOVER.md` (state, next step, blockers) and `DELIVERABLES.md` (status). Commit.
- A deliverable is `done` only when its acceptance criteria pass, verified by running the tests, not by assumption.
- New architectural choice → add an entry to `DECISIONS.md` first.
