# The live link

The learner works in the app; the AI agent works through the MCP server. The live link lets both edit **one**
circuit at the same time, see each other's changes and undo either. Decision: ADR-014. Code:
`OhmWork/packages/editing`, `OhmWork/apps/mcp/src/live/live-server.ts`, `OhmWork/apps/web/src/app/live/`.

## 1. MCP in one paragraph
MCP (Model Context Protocol) is a standard way for an AI agent to call tools. The OhmWork server
(`apps/mcp/src/server.ts`) offers tools such as `add_component`, `connect`, `simulate` and `check_solution`. The agent
calls them over stdio. They call engine and format functions directly, never clicks in the UI (ARCHITECTURE
rule 3), so the agent reads real readings, not a screenshot.

## 2. One document, one owner
**Read:** `packages/editing/src/circuit-document.ts`.
- `CircuitDocument` holds the circuit, a revision number and a history. Each entry records the circuit *before* the
  change and who made it (`"learner"` or `"agent"`).
- Every change goes through `apply(command, author)`. Commands (`edit-command.ts`) are the same for the app and the
  agent: add, connect, set a value, move, delete.
- `undo` restores the `before` circuit; anyone can undo anyone's change.
- `gesture`: turning a dial sends many edits; ones with the same gesture id merge into one history entry, so one undo
  reverses the whole turn.
- `subscribe` tells listeners after every change.

While linked, the MCP server's document is **the single source of truth**. The app doesn't keep its own copy in sync
by merging; it sends commands and shows what the server sends back.

## 3. The wire protocol
**Read:** `apps/mcp/src/live/live-server.ts`, `packages/editing/src/live-protocol.ts`.
- A WebSocket server inside the MCP process.
- The app sends `edit`, `undo`, `redo` or `replace` messages. The server validates each with Zod, applies it to the
  document as `"learner"`, and replies `rejected` with a reason if it fails.
- After every change, from either side, the server **broadcasts the whole circuit** with the revision and who changed
  what.

**Why the whole circuit and not just the change?** Circuits are kilobytes. One server applies commands in arrival
order, so there are no conflicting edits to merge: no operational transforms or CRDTs needed. Sending the whole state
also means a client that missed a message is corrected by the next one.

## 4. Feeling instant
**Read:** `apps/web/src/app/circuit/circuit-store.ts`, the `predicted` signal.
The app applies your edit locally at once and shows that *prediction*, then replaces it with the server's state when
it arrives. If the link drops, the app keeps working on its own copy. When the server returns, it hands that copy back
if the server's circuit is empty, and otherwise offers to use your offline changes (ADR-024, ADR-027, ADR-037).

## 5. Keeping it safe
Any website open in your browser can try to reach a server on your computer. So the link (`isAllowed`):
- listens on `127.0.0.1` only, so other machines can't reach it;
- accepts only allowed `Origin` headers (the app's address and any you add);
- requires a random 24-byte token from the link, compared in constant time (`timingSafeEqual`) so timing can't leak
  it;
- caps message size at the largest allowed circuit file.

A port is picked at random by default, so several agent sessions never collide.

## Test yourself
<details><summary>Why can the app and the agent edit at the same time without conflicts?</summary>
Only one place applies changes: the MCP server's document, in arrival order. Clients send commands and receive the
resulting state, so there's nothing to merge.
</details>

<details><summary>When would whole-state broadcast be the wrong choice?</summary>
When the state is large (a long document, a big spreadsheet) or many users edit at once over a slow network: then
you send diffs, and with several authorities you need OT or CRDTs.
</details>

<details><summary>What does the token protect against, if the server only listens on localhost?</summary>
A malicious web page in the same browser could open a WebSocket to localhost. The Origin check and the secret token
stop it from reading or editing the circuit.
</details>

<details><summary>Why compare the token in constant time?</summary>
A normal comparison stops at the first wrong character, so response time can reveal how much of a guess is right.
</details>

<details><summary>How does one undo reverse a whole dial turn?</summary>
Edits from the same gesture by the same author are merged into one history entry that keeps the circuit from before
the first one.
</details>

<details><summary>What happens when the agent's session ends?</summary>
The link closes; the app keeps the last shared circuit and works alone.
</details>
