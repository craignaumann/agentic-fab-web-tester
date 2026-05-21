---
name: web-test
description: Full web testing workflow — gather requirements, set up services, write and run Playwright tests in a worktree, and produce a structured report with pass/fail verdict.
argument-hint: "[PR URL or number, ticket URL, or test description]"
---

Use this skill to run a complete web testing session end-to-end: gather requirements, stand up both services on the correct branches, write and run Playwright tests, then produce a report with a clear pass/fail verdict.

---

## Step 1 — Gather requirements

Collect all of the following before writing a single test. The user may provide some or all of these as arguments.

**Branches:**
- Ask for (or confirm) the frontend branch to test.
- Ask for (or confirm) the backend branch to use (default: `main` unless told otherwise).
- Ask for (or confirm) the CLI runner branch to use (default: `main` unless told otherwise).

**Test scope:** Collect details from whichever sources are available:
- **GitHub PR:** If a PR URL or number is given, read the PR description, diff, and any review comments with `gh pr view` and `gh pr diff`. Identify new UI routes, components, API endpoints, and state changes introduced by the PR.
- **Ticket or task:** If a Linear/Jira/GitHub issue URL is given, fetch its title and description.
- **User description:** If neither is provided, ask the user to describe the feature or behaviour to test.

Summarise what you will test and confirm with the user before proceeding.

---

## Step 2 — Create a worktree and branch

Branch naming: `test-runs/<feature-slug>-<mon>-<year>` (e.g. `test-runs/api-keys-may-2026`).

From the project root:

```
git worktree add .worktrees/<branch-name> -b <branch-name>
```

Then call `EnterWorktree` with `path: .worktrees/<branch-name>`. All subsequent work happens inside that worktree.

---

## Step 3 — Update repos to the correct branches

Read `.env` at the project root for `BACKEND_REPO`, `FRONTEND_REPO`, `CLI_REPO`, `BACKEND_BRANCH`, `FRONTEND_BRANCH`, `CLI_BRANCH`, `BACKEND_PORT`, and `FRONTEND_PORT`. If `.env` is missing, tell the user to create it from `.env.example` and stop.

Override `BACKEND_BRANCH`, `FRONTEND_BRANCH`, and `CLI_BRANCH` with the branches confirmed in Step 1 if they differ from `.env`.

For each repo (`repos/backend`, `repos/frontend`, `repos/cli`):
- If already cloned: `git fetch origin`, then checkout the correct branch and pull.
- If not cloned: `git clone <REPO> repos/<backend|frontend|cli>`.

If any checkout fails, report the full error and stop.

---

## Step 4 — Start the backend

From `repos/backend`:
1. `bun install`
2. Check whether the existing DB (if any) is compatible with the current migrations. If the DB predates new migrations or has a conflicting history, delete it and start fresh — this is expected on any run where migrations changed.
3. `bun run migrate`
4. `bun run seed`
5. `PORT=$BACKEND_PORT bun run dev` in the background, logging to a temp file.

Wait until `GET http://localhost:$BACKEND_PORT/auth/me` returns any response (a 401 is expected and means the backend is up). Use `curl` without the `-f` flag so that 4xx responses are not treated as failures.

If the backend does not respond within 30 seconds, print the last 50 lines of its log and stop.

---

## Step 5 — Start the frontend

From `repos/frontend`:
1. `bun install`
2. `PORT=$FRONTEND_PORT bun run dev` in the background.

Wait until `GET http://localhost:$FRONTEND_PORT/` returns a 2xx response.

If it does not respond within 30 seconds, print the last 50 lines of its log and stop.

---

## Step 5b — Install CLI runner deps, generate credentials, start daemon

From `repos/cli`:
1. `bun install`

Then generate the test agent and API key by following **CLAUDE.md step 7** exactly (login as seed user, create agent, create API key, export `CLI_AGENT_ID` and `CLI_API_KEY` as shell variables).

Then start the CLI runner daemon by following **CLAUDE.md step 8** exactly (read `package.json`/README for startup command and env var names, start in background, verify alive, watch log).

If any sub-step fails, report the full error and stop.

---

## Step 6 — Write the tests

Create `tests/<feature-slug>.spec.ts`. Follow the patterns established in the existing test files:

- Use a `uid(prefix)` helper to generate unique emails per test, preventing data collisions across the shared SQLite DB.
- Register users and set up data via direct API calls where possible; use the UI only when testing UI flows specifically.
- Use authenticated API helpers that reuse the page's session cookies via `page.context().request`.
- Prefer semantic locators (`getByRole`, `getByLabel`, `getByText`) over CSS selectors.
- One behaviour per test; keep tests self-contained.
- When checking HTTP responses before disposing the request context, read the body before calling `ctx.dispose()`.

Cover the full scope identified in Step 1: new routes, UI states (empty, loading, populated, error), happy paths, and key error cases. Regression risk areas in the existing app should also be checked if the change touches shared layout or navigation.

---

## Step 7 — Run the tests

```
CLI_AGENT_ID="$CLI_AGENT_ID" CLI_API_KEY="$CLI_API_KEY" \
BACKEND_PORT="$BACKEND_PORT" bunx playwright test tests/<feature-slug>.spec.ts
```

If any test fails, do not modify the backend or frontend source to make it pass. Diagnose whether the failure is:
- A **test harness issue** (bad locator, timing, wrong assumption about the UI) — fix the test.
- An **app bug** (the UI or API behaves incorrectly) — leave the test failing and document it in the report.

Re-run until all harness issues are resolved. App bugs remain as failures in the report.

---

## Step 8 — Write the report

Find the next report number:
```
ls reports/ | sort | tail -1
```
Start at `0001` if `reports/` is empty. Write `reports/NNNN-report.md`.

### Report structure

```
# Test Run NNNN

**Date:** YYYY-MM-DD
**Backend branch:** <branch> (<repo>)
**Frontend branch:** <branch> (<repo>)
**CLI runner branch:** <branch> (<repo>)
**Tests run:** <file>
**Overall result:** ✅ PASS / ❌ FAIL

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Clone/update backend | ✅/❌ | |
| Clone/update frontend | ✅/❌ | |
| Clone/update CLI runner | ✅/❌ | |
| Database migration | ✅/❌ | |
| Backend started | ✅/❌ | |
| Frontend started | ✅/❌ | |
| Generate test agent + API key | ✅/❌ | |
| CLI runner started | ✅/❌ | |

<!-- Include full error output for any failed step -->

---

## Test results

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | ... | ... | ✅ Pass / ❌ Fail / ⏭ Not run |

**X passed, Y failed, Z not run**

<!-- For each failure: what the test expected, what the app actually did, and the screenshot path if captured -->

---

## Recommendations

### Backend team
- <natural language description of any backend bugs found, API contract issues, or missing response fields — no code>

### Frontend team
- <natural language description of any frontend bugs, incorrect assumptions about API shape, or UX issues — no code>
```

**Pass/fail rule:** The overall result is ❌ FAIL if any test fails for any reason — including regressions in existing flows. It is ✅ PASS only when every test passes.

---

## Step 9 — Commit and open a PR

Stage and commit both the test file and the report:

```
git add tests/<feature-slug>.spec.ts reports/NNNN-report.md
git commit -m "Add <feature> test suite and run report NNNN

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Push the branch and open a PR against `main`:

```
gh pr create --title "Test run NNNN: <feature> (<result>)" \
  --body "..."
```

PR body should include:
- What was tested (frontend branch, backend branch, feature scope)
- Overall result (pass/fail)
- One-line summary of any failures and which team owns them
- Link to the report file

Return the PR URL to the user.

---

## Step 10 — Tear down

Stop all three background processes (kill by PID or port). Also stop the CLI runner:

```bash
kill $CLI_PID 2>/dev/null || true
pkill -f "bun run start" 2>/dev/null || true
rm -f /tmp/cli-runner.log
```

Do not delete `repos/` — leave clones in place for future runs.
