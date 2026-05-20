# Test Run 0001

**Date:** 2026-05-20
**Backend branch:** main (`git@github.com:craignaumann/agentic-fab-api.git`)
**Frontend branch:** main (`git@github.com:craignaumann/agentic-fab-frontend.git`)
**Tests written:** `tests/auth.spec.ts`

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Clone backend | ✅ Pass | |
| Clone frontend | ✅ Pass | |
| `bun install` (backend) | ✅ Pass | |
| `bun run migrate` (backend) | ❌ Fail | See below |
| `bun run seed` (backend) | ⏭ Skipped | Blocked by migration failure |
| Backend start | ⏭ Skipped | Blocked by migration failure |
| `bun install` (frontend) | ✅ Pass | |
| Frontend start | ⏭ Skipped | Blocked by backend failure |

### Migration failure

```
SyntaxError: Export named 'Migrator' not found in module
  '.../node_modules/.bun/kysely@0.29.2/node_modules/kysely/dist/index.js'
```

**File:** `repos/backend/src/migrate.ts`, line 3

**Root cause:** kysely 0.29.x moved `Migrator` and `FileMigrationProvider` out of the main
package entry point and into the `kysely/migration` subpath. The migrate script still
imports them from `'kysely'`, which no longer exports them.

**Fix required in backend repo:**
```diff
- import { FileMigrationProvider, Migrator } from "kysely";
+ import { FileMigrationProvider, Migrator } from "kysely/migration";
```

---

## Tests

Tests were written but could not be run due to the setup failure above.

### `tests/auth.spec.ts` — 11 tests

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | Register | happy path: valid credentials redirect to login | ⏭ Not run |
| 2 | Register | mismatched passwords shows validation error | ⏭ Not run |
| 3 | Register | short password shows validation error | ⏭ Not run |
| 4 | Register | invalid email format shows validation error | ⏭ Not run |
| 5 | Register | duplicate email shows error without redirect | ⏭ Not run |
| 6 | Login | happy path: valid credentials redirect to /agents | ⏭ Not run |
| 7 | Login | wrong password shows error | ⏭ Not run |
| 8 | Login | unknown email shows error | ⏭ Not run |
| 9 | Login | unauthenticated visit to /agents redirects to /login | ⏭ Not run |
| 10 | Logout | logout button redirects to /login | ⏭ Not run |
| 11 | Logout | session is cleared after logout: /agents redirects to /login | ⏭ Not run |

---

## Recommendations

1. **Backend team:** Fix the kysely import in `src/migrate.ts` (see above). This is the only blocker — no other setup issues were found.
2. Once fixed, re-run this session to produce run 0002 with actual test results.
