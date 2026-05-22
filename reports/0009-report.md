# Test Run 0009

**Date:** 2026-05-22
**Backend branch:** feat/usage-tracking (git@github.com:craignaumann/agentic-fab-api.git)
**Frontend branch:** feat/usage-tracking-display (git@github.com:craignaumann/agentic-fab-frontend.git)
**CLI runner branch:** feat/mock-usage-reporting (git@github.com:craignaumann/agentic-fab-runner.git)
**Tests run:** tests/usage-tracking.spec.ts
**Overall result:** ✅ PASS

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Clone/update backend | ✅ | Switched to feat/usage-tracking |
| Clone/update frontend | ✅ | Switched to feat/usage-tracking-display |
| Clone/update CLI runner | ✅ | Switched to feat/mock-usage-reporting |
| Database migration | ✅ | 7 migrations applied (incl. 2 new: add_usage_to_messages, create_session_usage) |
| Backend started | ✅ | QUEUE_DRIVER=inline injected — aggregation job runs synchronously |
| Frontend started | ✅ | Port 7332 |
| Generate test agent + API key | ✅ | CLI_AGENT_ID=1, Test Runner agent |
| CLI runner started | ✅ | Polling every 5s; processed all test sessions correctly |

**Setup note:** Backend was started with `QUEUE_DRIVER=inline` to ensure the session-usage aggregation background job executes synchronously (no Redis required). This is the correct approach for the test harness environment.

---

## Tests

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | usage tracking — per-message inline tokens | message feed shows inline token counts for each assistant message | ✅ Pass |
| 2 | usage tracking — result message usage section | result message shows aggregate cost and token counts in emerald block | ✅ Pass |
| 3 | usage tracking — model breakdown collapsible | model breakdown expands to show per-model token rows | ✅ Pass |
| 4 | usage tracking — session usage card | session page shows usage card with totals and model breakdown after close | ✅ Pass |

**4 passed, 0 failed, 0 not run**

### What each test verified

**Test 1 — Per-message inline token usage**  
The message feed renders `{n} in · {n} out` inline below each assistant message when usage data is present. All three mock messages with usage (120/38, 80/18, 280/64 tokens) were confirmed visible after the session closed and the page reloaded.

**Test 2 — Result message usage section**  
The result message renders an emerald-bordered block (`border-l-emerald-500`) containing the aggregate cost (`Total cost: $0.0024`), input token count (`480 input tokens`), output token count (`120 output tokens`), and a "Model breakdown" collapsible summary.

**Test 3 — Model breakdown expand/collapse**  
The `<details>` element in the result message is collapsed by default (model names not visible). Clicking "Model breakdown" expands it and reveals both model rows: `claude-opus-4-7-20251101` and `claude-haiku-4-5-20251001`.

**Test 4 — Session usage card**  
After a session closes, the `ViewAgentSession` page fetches `GET /agent-sessions/:id/usage` and renders a "Session Usage" card with total cost (`$0.0024`), input tokens (`480`), output tokens (`120`), cache read tokens (`4,000` — formatted with toLocaleString), and a model breakdown table with 2 rows.

### Harness adjustments made during this run

Two locator issues were corrected during development (both were test-authoring mistakes, not app bugs):

1. **Strict-mode violation in test 3**: `page.getByText('claude-opus-4-7-20251101')` resolved to 2 elements because both the result message and the session usage card render model breakdown tables. Fixed by scoping all model-name assertions to `page.locator('.border-l-emerald-500')` (the result block container).

2. **Wrong role for CardTitle in test 4**: shadcn `CardTitle` renders as a `<div>`, not a semantic heading element. `getByRole('heading', { name: 'Session Usage' })` found nothing. Fixed by using `page.getByText('Session Usage', { exact: true })` instead.

---

## Recommendations

### Backend team
- Feature is working end-to-end. The two new migrations (`agent_sessions_003_add_usage_to_messages`, `agent_sessions_004_create_session_usage`) apply cleanly, and the `GET /agent-sessions/:id/usage` endpoint returns correct aggregated values from the CLI mock payload.
- For production deployments, ensure `QUEUE_DRIVER` (or equivalent config) is documented — the default BullMQ driver requires Redis, while `inline` mode works without it. The test harness relies on `inline` mode for synchronous aggregation.

### Frontend team
- All usage display features are working correctly: per-message inline tokens, result-event usage block, model breakdown collapsible, and session usage card.
- No `data-testid` attributes are present on usage-related elements. If more granular test coverage is wanted in future, consider adding `data-testid="session-usage-card"` and `data-testid="result-usage-block"` to make targeting more robust.

### CLI runner team
- Mock usage data is flowing through correctly. The two-model `model_usage` payload (`claude-opus-4-7-20251101` and `claude-haiku-4-5-20251001`) and the cache token fields all round-trip cleanly from the runner through the backend to the frontend display.
