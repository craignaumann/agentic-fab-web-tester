# Test Run 0008

**Date:** 2026-05-21
**Backend branch:** feat/websocket-messages (git@github.com:craignaumann/agentic-fab-api.git)
**Frontend branch:** feat/websocket-chat-messages (git@github.com:craignaumann/agentic-fab-frontend.git)
**CLI runner branch:** feat/websocket-mock-provider (git@github.com:craignaumann/agentic-fab-runner.git)
**Tests run:** tests/cli-agent-sessions.spec.ts
**Overall result:** ✅ PASS

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Clone/update backend | ✅ | Checked out feat/websocket-messages |
| Clone/update frontend | ✅ | Checked out feat/websocket-chat-messages |
| Clone/update CLI runner | ✅ | Cloned fresh; checked out feat/websocket-mock-provider |
| Database migration | ✅ | Deleted stale app.db; 5 migrations applied (includes agent_sessions_002_create_claude_code_messages) |
| Backend started | ✅ | Listening on port 7330; /auth/me returned 401 in 1s |
| Frontend started | ✅ | Listening on port 7332; returned 200 in 1s |
| Generate test agent + API key | ✅ | Agent "Test Runner" created (ID=1); API key afk_7a49af60… generated |
| CLI runner started | ✅ | PID 50329; startup log: `Worker started pollIntervalMs=2000 maxConcurrency=4` |

---

## Test results

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | CLI runner — daemon claim | daemon claims an open session | ✅ Pass |
| 2 | CLI runner — daemon close | daemon closes a session after processing | ✅ Pass |
| 3 | CLI runner — session detail UI | session detail page shows daemon has picked up the session | ✅ Pass |
| 4 | CLI runner — full e2e UI flow | user creates session via UI form, daemon processes it, UI shows Closed with messages | ✅ Pass |

**4 passed, 0 failed, 0 not run**

---

## What was tested

The `feat/websocket-mock-provider` CLI runner introduces a `MockProvider` that connects to the backend's new WebSocket endpoint (`/agent-sessions/:id/agent-ws`) and replays a scripted sequence of SDK events (system init, user message, assistant thinking + tool use + text response, result, system close). These events are persisted as `ClaudeCodeMessage` records by the backend (`feat/websocket-messages`), then fetched and rendered in the session detail view by the frontend (`feat/websocket-chat-messages`).

**Test 1** verified the daemon polls `GET /agent-sessions/open?agent_id=1` and transitions a session from `open` → `claimed` within the poll interval.

**Test 2** verified the daemon completes the mock event sequence and calls `PATCH /agent-sessions/:id/close`, transitioning status to `closed` with a `closed_at` timestamp.

**Test 3** verified the session detail page shows the session is no longer `Open` after the daemon picks it up — correctly rendering `Claimed` or `Closed` depending on how quickly the page loaded relative to processing completion.

**Test 4** exercised the full flow end-to-end: UI form submission → daemon processing → page reload → `Closed` badge + visible mock messages ("Task completed successfully." and the `[MockProvider]` text block).

---

## Recommendations

### Backend team
- All endpoints behaved correctly. The new WebSocket endpoint (`/agent-sessions/:id/agent-ws`) accepted the CLI runner's `Authorization: Bearer <api-key>` connection without issues, and messages were persisted and served correctly through `GET /agent-sessions/:id/messages`.

### Frontend team
- The `MessageFeed` rendered all mock provider event types correctly after reload. The `useAgentSessionWs` live connection indicator ("Live" dot) was not explicitly tested here — a follow-up test verifying real-time message delivery during an active session would be valuable.

### CLI runner team
- The `POLL_INTERVAL_MS=2000` setting worked well for testing. Consider documenting this tunable in the README's configuration table (currently only `POLL_INTERVAL_MS` and `MAX_CONCURRENCY` are listed — `BACKEND_URL`, `API_KEY`, and `AGENT_ID` are required but not documented there).
