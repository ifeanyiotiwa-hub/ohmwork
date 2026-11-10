# Lessons and challenges

A lesson asks the learner to build something, and checks the circuit they built by what it does, never by part ids
or where parts sit, so any correct circuit passes however it is laid out or named. Code: `packages/lessons`
(`src/schema.ts` is the format, `src/check.ts` runs the checks, `src/lessons/` holds one file per lesson).

## The format
| Field | Meaning |
|---|---|
| `id` | lowercase-with-dashes, unique |
| `title` | shown in the Lessons list; a challenge's starts "Challenge:" |
| `level` | `beginner` (one idea, a few parts), `intermediate` (op-amps, logic, flip-flops), `advanced` (timing, filters, design) |
| `kind` | `lesson` (steps, each with an optional hint held back until asked for) or `challenge` (a goal and no steps: the learner designs it) |
| `summary` | one sentence on the idea, shown on hover |
| `goal` | what to end up with, with the numbers the checks use |
| `steps` | `{ text, hint? }`; empty for a challenge |
| `checks` | at least one; the lesson passes when every one does |

## Checks
Every check has a `description`: what it looks for, in plain words with the numbers, as the learner reads it. When a
check fails, the learner sees what the circuit actually does (`found`), e.g. "LED1 carries 3.2 A".

| `kind` | Passes when | Fields |
|---|---|---|
| `has-part` | there are at least `atLeast` parts of `type` | `type`, `atLeast` |
| `reading` | some part of `type` has a DC `quantity` (voltage, current, power) in `between`, by size unless `signed`; `pressed` holds every push button | `type`, `quantity`, `between`, `signed?`, `pressed?` |
| `node-voltage` | some point of the circuit sits at a DC voltage in `between` | `between` |
| `pin-voltage` | some part of `type` has its `pin` at a DC voltage in `between` (from ground): an op-amp's or a 555's output | `type`, `pin`, `between` |
| `reading-at` | running from rest for `at` seconds, some part of `type` has `quantity` in `between` | `type`, `quantity`, `at`, `between` |
| `frequency` | running from rest, after `after` seconds and over `for` more, some part of `type` has its `pin` rising through the middle of its swing `between` times a second | `type`, `pin`, `after`, `for`, `between` (Hz) |
| `ac-gain` | at `at` hertz, some scope probe sees a gain in `between` dB relative to the first AC source (small signal, as SPICE `.ac`) | `at`, `between` (dB) |
| `truth-table` | logic inputs (in id order) set to each row give logic outputs matching it; output columns may be in any order | `rows: { inputs, outputs }[]` |
| `no-errors` | the circuit simulates | – |

A `frequency` check steps no finer than it needs to cover its time in 20,000 steps, whatever the circuit's own time
step, so checking a slow blinker stays quick (a 10 Hz blinker over 0.7 s: 35 µs steps, 0.04% a cycle).

## Writing a good lesson
- Check behaviour, not construction: "an op-amp's output is at 2 V", not "R1 is 9 kΩ". `has-part` only for what the lesson is about.
- Ranges, not exact values: allow for E12 parts and ±5% (a 10 Hz blinker passes 8–13 Hz).
- Every number in the goal is one a check uses, and every check's description says it.
- Hints lead to the next idea (the formula, what to look at); they don't hand over the answer.
- A challenge states the goal precisely enough to be checked, and no more.

## Testing a lesson (required)
In `packages/lessons/test`:
1. a reference solution in `solutions.ts`, built as a learner would (`build`), which must pass every check;
2. an empty circuit must fail (every lesson, automatically), with something to say in `found`;
3. a typical mistake in `lessons.test.ts` (an LED without its resistor, resistors swapped, a capacitor ten times off), which must fail with a `found` that shows what went wrong.
Then add it to `LESSONS` in `src/lessons/index.ts`, in teaching order.

## Drafted by the agent
The AI agent can draft a lesson or challenge with the MCP tools: `lesson_format` gives it this format as JSON Schema,
the rules and an example; it builds a correct circuit, then `save_lesson_draft` saves the lesson with that circuit as
its reference solution to `lesson-drafts/<id>.json` in the workspace, but only if the circuit passes every check and
an empty circuit does not. A person reviews the draft, then adds it as above (the file, the reference solution, a
typical mistake). Nothing reaches the app before that.
