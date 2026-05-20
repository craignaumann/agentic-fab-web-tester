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
BACKEND_BRANCH=main
FRONTEND_BRANCH=main
BACKEND_PORT=7330
FRONTEND_PORT=7332
```

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
  tests/                # Playwright test files
  playwright.config.ts
```

---

## Setup Workflow

Run these steps in order before writing or running any tests. If any step fails, stop and report the error with full output — do not attempt to work around setup failures.

### 1. Load config

Read `.env` and export the four variables. If `.env` is missing, tell the user to create it from `.env.example` and stop.

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
PORT=$BACKEND_PORT bun run dev
```

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

---

## Writing Playwright Tests

- Put all test files under `tests/`.
- Use `http://localhost:$FRONTEND_PORT` (from `.env`) as the base URL for the frontend.
- Use `http://localhost:$BACKEND_PORT` (from `.env`) as the base URL for direct backend API calls.
- Tests must be self-contained: each test should set up any data it needs via the UI or API, and must not depend on test ordering.
- Prefer testing via the UI (frontend) over calling the API directly, unless the task specifically requires API-level validation.
- Keep tests focused: one behavior per test.

### Running tests

```bash
bunx playwright test
```

Or a specific file:

```bash
bunx playwright test tests/my-feature.spec.ts
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
**Tests run:** <file(s)>

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Clone backend | ✅/❌ | |
| ...           | ...   | |

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

- **Never modify backend or frontend source code.** Not to fix bugs, not to make tests pass, not for any reason. Those repos are read-only from your perspective. If something in the app is broken, report it.
- **Never modify backend or frontend config files** (e.g. `.env` files inside the cloned repos) except to set the port if no other mechanism exists, and only if that change is strictly required to start the service.
- All changes you make must stay within this repo (`agentic-fab-web-tester/`), specifically under `tests/` and supporting config at the root.

---

## Teardown

When done, stop the backend and frontend processes and clean up any temp files. Do not delete `repos/` — leave clones in place for the next run (they will be updated via `fetch`/`pull`).

---

## Notes

- Both ports are configurable via `.env`: `BACKEND_PORT` (default 7330) and `FRONTEND_PORT` (default 7332).
- The backend uses SQLite — each run migrates and seeds from scratch into a clean DB file. Confirm the DB file path from the backend config before running migrations.
- Never commit `.env` — it contains repo URLs and may contain secrets.
