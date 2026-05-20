# Test Run 0002

**Date:** 2026-05-20
**Backend branch:** main (git@github.com:craignaumann/agentic-fab-api.git)
**Frontend branch:** main (git@github.com:craignaumann/agentic-fab-frontend.git)
**Tests run:** tests/auth.spec.ts

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Fetch/pull backend | ✅ | Already up to date |
| Fetch/pull frontend | ✅ | Pulled 2 new commits (`src/lib/api.ts`, `.env.example`) |
| Backend deps (`bun install`) | ✅ | |
| Frontend deps (`bun install`) | ✅ | |
| Backend migrate | ✅ | 2 migration files copied and applied |
| Backend seed | ✅ | `test@example.com` seeded |
| Backend started (port 7330) | ✅ | Confirmed via `GET /auth/me` → 401 |
| Frontend started (port 7332) | ✅ | Confirmed via `GET /` → 200 |
| Write `repos/frontend/.env` | ✅ | Set `VITE_API_PORT=7330` (required so frontend points to backend) |

---

## Tests

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | Register | happy path: valid credentials redirect to login | ✅ Pass |
| 2 | Register | mismatched passwords shows validation error | ✅ Pass |
| 3 | Register | short password shows validation error | ✅ Pass |
| 4 | Register | invalid email format shows validation error | ❌ Fail |
| 5 | Register | duplicate email shows error without redirect | ✅ Pass |
| 6 | Login | happy path: valid credentials redirect to /agents | ❌ Fail |
| 7 | Login | wrong password shows error | ❌ Fail |
| 8 | Login | unknown email shows error | ❌ Fail |
| 9 | Login | unauthenticated visit to /agents redirects to /login | ✅ Pass |
| 10 | Logout | logout button redirects to /login | ❌ Fail |
| 11 | Logout | session is cleared after logout: /agents redirects to /login | ❌ Fail |

**5 passed, 6 failed**

---

## Failure Details

### Test 4 — Register: invalid email format shows validation error

**Assertion:** `expect(page.getByText('Invalid email address')).toBeVisible()`

**Root cause (frontend bug):** The Register `<form>` element does not have `noValidate`. When the user submits `not-an-email` in the `<input type="email">`, the browser fires its own HTML5 email validation before React can handle the submit event. A browser-native tooltip appears ("Please include an '@' in the email address…") instead of the Zod validation message. The Zod error "Invalid email address" never renders in the DOM.

**Screenshot:** `test-results/auth-Register-invalid-email-format-shows-validation-error/test-failed-1.png`

---

### Tests 6, 10, 11 — Login happy path / Logout tests

**Assertion:** `expect(page).toHaveURL('/agents')` — received `/login`

**Root cause (frontend bug — race condition):** `AuthContext.login()` calls `navigate('/agents')` synchronously while `api.auth.me()` is still in flight:

```ts
function login() {
  api.auth.me().then(setUser).catch(() => null)  // async, not awaited
  navigate('/agents')                             // fires immediately
}
```

When the browser arrives at `/agents`, `ProtectedRoute` evaluates `loading` (already `false` from the initial page load) and `user` (still `null` because `/auth/me` hasn't resolved). It immediately redirects to `/login`. The user can never reach the authenticated area via the UI login flow.

**Note:** The backend login API itself works correctly — direct API calls return 200 with a valid JWT cookie.

**Screenshot:** `test-results/auth-Login-happy-path-valid-credentials-redirect-to-agents/test-failed-1.png`

---

### Tests 7, 8 — Login: wrong password / unknown email shows error

**Assertion:** `expect(page.getByText('Invalid credentials')).toBeVisible()` — element not found

**Root cause (backend bug — error message not propagated):** The backend login port throws `AuthenticationError("Invalid credentials")`, but the `@tails/core` error formatter returns a generic `{"success":false,"message":"Unauthorized"}` to the client. The frontend displays "Unauthorized" in the error state instead of the intended "Invalid credentials" message.

**Observed UI text:** "Unauthorized" (in red)
**Expected UI text:** "Invalid credentials"

**Screenshot:** `test-results/auth-Login-wrong-password-shows-error/test-failed-1.png`

---

## Recommendations

### Frontend team

1. **Race condition in `AuthContext.login()`** (`src/contexts/AuthContext.tsx`): `login()` must wait for `/auth/me` to resolve before navigating. Either `await` the call and set `user` before calling `navigate('/agents')`, or introduce a loading state that keeps `ProtectedRoute` in its null-render until the session is confirmed. This is a blocking bug — no user can complete a login via the UI.

2. **Missing `noValidate` on Register form** (`src/pages/Register.tsx`): Add `noValidate` to the `<form>` element so that browser-native HTML5 validation is suppressed and the Zod validation messages render instead. Example: `<form noValidate onSubmit={...}>`.

### Backend team

3. **`AuthenticationError` message swallowed** (`engines/auth/src/ports/login.ts` + `@tails/core` error handler): The specific message passed to `AuthenticationError` ("Invalid credentials") is not included in the API response; only the generic "Unauthorized" is returned. The error formatter in `@tails/core` should propagate the message from authentication errors so callers can display user-friendly copy.
