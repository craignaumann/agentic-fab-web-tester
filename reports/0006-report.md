# Test Run 0006

**Date:** 2026-05-20
**Backend branch:** fix/api-keys-create-revoked-at (git@github.com:craignaumann/agentic-fab-api.git)
**Frontend branch:** feat/settings-api-keys (git@github.com:craignaumann/agentic-fab-frontend.git)
**Tests run:** tests/api-keys.spec.ts
**Overall result:** ✅ PASS

---

## Setup

| Step | Status | Notes |
|---|---|---|
| Update backend | ✅ | Checked out fix/api-keys-create-revoked-at |
| Update frontend | ✅ | Already on feat/settings-api-keys, up to date |
| Database reset | ✅ | Deleted stale app.db, migrated and seeded clean |
| Backend started (port 7330) | ✅ | |
| Frontend started (port 7332) | ✅ | |
| Backend health check | ✅ | GET /auth/me → 401 (expected) |
| Frontend health check | ✅ | GET / → 200 |

---

## Test results

| # | Describe | Test | Result |
|---|---|---|---|
| 1 | Header and settings navigation | avatar shows first letter of email as initial | ✅ Pass |
| 2 | Header and settings navigation | avatar dropdown shows user email | ✅ Pass |
| 3 | Header and settings navigation | navigates to settings from avatar dropdown | ✅ Pass |
| 4 | Settings sidebar navigation | Profile link is active on profile page | ✅ Pass |
| 5 | Settings sidebar navigation | API Keys link navigates to api-keys page | ✅ Pass |
| 6 | Settings sidebar navigation | API Keys link is active on api-keys page | ✅ Pass |
| 7 | Settings sidebar navigation | Profile page shows the logged-in user email | ✅ Pass |
| 8 | API Keys – empty state | shows empty state when no keys exist | ✅ Pass |
| 9 | API Keys – generate | clicking Generate shows one-time reveal banner | ✅ Pass |
| 10 | API Keys – generate | banner contains a non-empty key in a code block | ✅ Pass |
| 11 | API Keys – generate | copy button shows checkmark feedback after click | ✅ Pass |
| 12 | API Keys – generate | dismissing the banner removes it | ✅ Pass |
| 13 | API Keys – generate | generated key appears in the list with a masked prefix | ✅ Pass |
| 14 | API Keys – generate | generated key shows Active badge | ✅ Pass |
| 15 | API Keys – generate | key appears in list after page reload without banner | ✅ Pass |
| 16 | API Keys – revoke | clicking Revoke opens confirmation dialog | ✅ Pass |
| 17 | API Keys – revoke | cancelling dialog keeps key as Active | ✅ Pass |
| 18 | API Keys – revoke | confirming revoke changes badge to Revoked | ✅ Pass |
| 19 | API Keys – revoke | Revoke button is disabled after revocation | ✅ Pass |
| 20 | API Keys – revoke | revoked state persists after page reload | ✅ Pass |
| 21 | API Keys – revoke | only the targeted key is revoked when multiple exist | ✅ Pass |

**21 passed, 0 failed**

---

## Recommendations

### Backend team

The fix on `fix/api-keys-create-revoked-at` resolves the issue identified in run 0005. The create endpoint now includes `revoked_at` in its response, and newly generated keys correctly display as Active in the UI. No further issues found. Ready to merge.

### Frontend team

No issues found. All navigation, key generation, copy, and revoke flows behave correctly against the fixed backend. The Settings layout, sidebar navigation, profile page, and API keys page are all working as expected.
