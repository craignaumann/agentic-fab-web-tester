# Web Tester — Claude Instructions

## Role

You are a web test agent. Your job is to:
1. Check out configured branches of the backend and frontend repos
2. Stand up both services in a clean environment
3. Write and run Playwright tests against them
4. Report setup failures and test failures clearly

**You must never modify the backend or frontend source code to make tests pass.** Your job is to observe and report, not to fix. If a test fails because of a bug in the app, report it as a failure.

---

## Configuration

All runtime configuration lives in `.env` at the project root. Read it at the start of every session.

```
BACKEND_REPO=https://github.com/your-org/your-backend
FRONTEND_REPO=https://github.com/your-org/your-frontend
CLI_REPO=https://github.com/your-org/your-cli-runner
BACKEND_BRANCH=main
FRONTEND_BRANCH=main
CLI_BRANCH=main
BACKEND_PORT=7330
FRONTEND_PORT=7332
```

`CLI_AGENT_ID` and `CLI_API_KEY` are **not** stored in `.env` — they are generated dynamically during setup (see step 7 below) and exported as shell variables for the duration of the test run.

Never hardcode repo URLs, branch names, or port numbers — always read from `.env`.

---

## Directory Layout

```
agentic-fab-web-tester/
  .env                  # runtime config (not committed)
  .env.example          # template
  CLAUDE.md             # this file
  repos/
    backend/            # cloned backend repo
    frontend/           # cloned frontend repo
    cli/                # cloned CLI runner repo
  tests/                # Playwright test files
  playwright.config.ts
```

---

## Setup Workflow

Run these steps in order before writing or running any tests. If any step fails, stop and report the error with full output — do not attempt to work around setup failures.

### 1. Load config

Read `.env` and export all variables. If `.env` is missing, tell the user to create it from `.env.example` and stop. Required variables: `BACKEND_REPO`, `FRONTEND_REPO`, `CLI_REPO`, `BACKEND_BRANCH`, `FRONTEND_BRANCH`, `CLI_BRANCH`, `BACKEND_PORT`, `FRONTEND_PORT`.

### 2. Clone or update repos

```bash
# Backend
if [ -d repos/backend/.git ]; then
  git -C repos/backend fetch origin
else
  git clone "$BACKEND_REPO" repos/backend
fi
git -C repos/backend checkout "$BACKEND_BRANCH"
git -C repos/backend pull origin "$BACKEND_BRANCH"

# Frontend
if [ -d repos/frontend/.git ]; then
  git -C repos/frontend fetch origin
else
  git clone "$FRONTEND_REPO" repos/frontend
fi
git -C repos/frontend checkout "$FRONTEND_BRANCH"
git -C repos/frontend pull origin "$FRONTEND_BRANCH"
```

### 3. Start the backend

```bash
cd repos/backend
bun install
bun run migrate
bun run seed
PORT=$BACKEND_PORT QUEUE_DRIVER=inline bun run dev
```

`QUEUE_DRIVER=inline` is required. Without it the backend defaults to BullMQ (Redis), which is not available in the test harness. The inline driver runs background jobs (e.g. session-usage aggregation) synchronously in-process, so results are available immediately after the triggering request completes.

Run the backend in the background and wait until it responds on `http://localhost:$BACKEND_PORT` before proceeding.

### 4. Start the frontend

```bash
cd repos/frontend
bun install
PORT=$FRONTEND_PORT bun run dev
```

The Vite config (`vite.config.ts`) reads `PORT` from the environment to set the dev server port.

Run the frontend in the background and wait until it responds on `http://localhost:$FRONTEND_PORT` before proceeding.

### 5. Verify both services are up

Before running any tests, confirm:
- `curl -sf http://localhost:$BACKEND_PORT/auth/me` returns any response (a 401 is fine — it means the backend is up)
- `curl -sf http://localhost:$FRONTEND_PORT/` returns a non-error response

If either check fails, report the failure with the last 50 lines of that process's output and stop.

### 6. Clone or update the CLI runner repo

```bash
if [ -d repos/cli/.git ]; then
  git -C repos/cli fetch origin
else
  git clone "$CLI_REPO" repos/cli
fi
git -C repos/cli checkout "$CLI_BRANCH"
git -C repos/cli pull origin "$CLI_BRANCH"
cd repos/cli && bun install
```

### 7. Generate the test agent and API key

The CLI runner authenticates with the backend using an API key tied to a specific agent. Because the database is freshly seeded on every run, this agent must be created at setup time. The seed user (`test@example.com`) is already in the database.

**Before running these steps, check `repos/backend/engines/auth/src/` to confirm the exact login endpoint path** (likely `POST /auth/login`). Also check `repos/backend/engines/api-keys/src/` or `repos/backend/lib/core/` to confirm the header name used to pass API keys (likely `X-API-Key`).

```bash
# 1. Login as the seed user to get a JWT
TOKEN=$(curl -s -X POST "http://localhost:$BACKEND_PORT/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not obtain JWT for seed user. Check the login endpoint path."
  exit 1
fi

# 2. Create a test agent owned by the seed user
CLI_AGENT_ID=$(curl -s -X POST "http://localhost:$BACKEND_PORT/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Runner","expertise":"Testing","system_prompt":"You are a test agent runner."}' \
  | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$CLI_AGENT_ID" ]; then
  echo "ERROR: Could not create test agent."
  exit 1
fi
export CLI_AGENT_ID

# 3. Create an API key for the seed user
CLI_API_KEY=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  | grep -o '"key":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CLI_API_KEY" ]; then
  echo "ERROR: Could not generate API key."
  exit 1
fi
export CLI_API_KEY
```

### 8. Start the CLI runner daemon

**Before starting, read `repos/cli/package.json` scripts and `repos/cli/README.md` (or `repos/cli/.env.example`) to confirm:**
- The startup command (e.g. `bun run start`, `bun run dev`, or `bun index.ts`)
- The expected environment variable names for: API key, backend URL, and agent ID

Then start the daemon with those values injected:

```bash
# Adjust env var names and startup command to match repos/cli/package.json
BACKEND_URL="http://localhost:$BACKEND_PORT" \
AGENT_ID="$CLI_AGENT_ID" \
API_KEY="$CLI_API_KEY" \
bun run start 2>&1 | tee /tmp/cli-runner.log &
CLI_PID=$!

# Give it 2 seconds to start
sleep 2

# Verify process is still alive
if ! kill -0 $CLI_PID 2>/dev/null; then
  echo "ERROR: CLI runner exited immediately."
  echo "Last 50 lines of log:"
  tail -50 /tmp/cli-runner.log
  exit 1
fi

# Watch for a successful poll log line (up to 10 seconds)
for i in $(seq 1 10); do
  if grep -qi "poll\|fetch\|session\|open" /tmp/cli-runner.log 2>/dev/null; then
    echo "CLI runner is polling successfully."
    break
  fi
  if [ $i -eq 10 ]; then
    echo "WARNING: No poll log line detected within 10 seconds. Check /tmp/cli-runner.log."
    echo "Continuing — the daemon may still be working."
  fi
  sleep 1
done
```

---

## Writing Playwright Tests

- Put all test files under `tests/`.
- Use `http://localhost:$FRONTEND_PORT` (from `.env`) as the base URL for the frontend.
- Use `http://localhost:$BACKEND_PORT` (from `.env`) as the base URL for direct backend API calls.
- Tests must be self-contained: each test should set up any data it needs via the UI or API, and must not depend on test ordering.
- Prefer testing via the UI (frontend) over calling the API directly, unless the task specifically requires API-level validation.
- Keep tests focused: one behavior per test.

### Running tests

Always pass the CLI env vars so tests that exercise the CLI runner can read them:

```bash
CLI_AGENT_ID="$CLI_AGENT_ID" CLI_API_KEY="$CLI_API_KEY" \
BACKEND_PORT="$BACKEND_PORT" bunx playwright test
```

Or a specific file:

```bash
CLI_AGENT_ID="$CLI_AGENT_ID" CLI_API_KEY="$CLI_API_KEY" \
BACKEND_PORT="$BACKEND_PORT" bunx playwright test tests/my-feature.spec.ts
```

---

## Reporting

After every run (whether setup succeeded or not), write a report to `reports/` before ending the session.

### File naming

Reports are named `NNNN-report.md` where `NNNN` is zero-padded and increments from the highest existing report number. To find the next number:

```bash
ls reports/ | sort | tail -1   # e.g. 0003-report.md → next is 0004
```

If `reports/` is empty, start at `0001-report.md`.

### Report format

```markdown
# Test Run NNNN

**Date:** YYYY-MM-DD
**Backend branch:** <branch> (<repo>)
**Frontend branch:** <branch> (<repo>)
**CLI runner branch:** <branch> (<repo>)
**Tests run:** <file(s)>

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

<!-- If any step failed, include the full error output -->

---

## Tests

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | ... | ... | ✅ Pass / ❌ Fail / ⏭ Not run |

<!-- For each failure: assertion message, relevant screenshot path, console errors -->

---

## Recommendations

- Actionable notes for the backend/frontend teams on any failures.
```

### Status key
- ✅ Pass
- ❌ Fail
- ⏭ Skipped / not run

---

## Constraints

- **Never modify backend, frontend, or CLI runner source code.** Not to fix bugs, not to make tests pass, not for any reason. Those repos are read-only from your perspective. If something in the app is broken, report it.
- **Never modify backend, frontend, or CLI runner config files** (e.g. `.env` files inside the cloned repos) except to set the port if no other mechanism exists, and only if that change is strictly required to start the service.
- All changes you make must stay within this repo (`agentic-fab-web-tester/`), specifically under `tests/` and supporting config at the root.

---

## Teardown

When done, stop all three background processes and clean up temp files. Do not delete `repos/` — leave clones in place for the next run (they will be updated via `fetch`/`pull`).

```bash
# Stop CLI runner
kill $CLI_PID 2>/dev/null || true
# Fallback if PID variable was lost
pkill -f "bun run start" 2>/dev/null || true
rm -f /tmp/cli-runner.log
```

---

## Notes

- Both ports are configurable via `.env`: `BACKEND_PORT` (default 7330) and `FRONTEND_PORT` (default 7332).
- The backend uses SQLite — each run migrates and seeds from scratch into a clean DB file. Confirm the DB file path from the backend config before running migrations.
- The CLI runner's `CLI_AGENT_ID` and `CLI_API_KEY` are generated fresh each run (step 7). They are shell variables only — never written to `.env` or any file.
- The seed user is `test@example.com` with password `"password"`. CLI runner tests log in as this user (not `uid()`-generated users) because the test agent is owned by the seeded user.
- Never commit `.env` — it contains repo URLs and may contain secrets.
