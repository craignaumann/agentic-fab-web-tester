import { test, expect } from '@playwright/test'

const BACKEND = `http://localhost:${process.env.BACKEND_PORT ?? '7330'}`
const CLI_AGENT_ID = Number(process.env.CLI_AGENT_ID ?? '1')

// ms to wait for daemon to claim/close a session
const CLI_POLL_TIMEOUT = 20_000
const CLI_POLL_INTERVAL = 500

// Logs in as the pre-seeded test@example.com user via the UI form only.
// Does NOT call POST /auth (register) — the seed user already exists.
async function loginSeedUser(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/agents')
}

async function apiCreateSession(
  page: import('@playwright/test').Page,
  data: { agent_id: number; title: string; initial_prompt: string },
) {
  const res = await page.context().request.post(`${BACKEND}/agent-sessions`, { data })
  if (!res.ok()) throw new Error(`API create session failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{
    id: number
    agent_id: number
    title: string
    initial_prompt: string
    status: string
    claimed_at: string | null
    closed_at: string | null
    created_at: string
  }>
}

// Polls GET /agent-sessions/:id until status matches targetStatus or timeout expires.
async function waitForSessionStatus(
  page: import('@playwright/test').Page,
  sessionId: number,
  targetStatus: 'open' | 'claimed' | 'closed',
  timeoutMs = CLI_POLL_TIMEOUT,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await page.context().request.get(`${BACKEND}/agent-sessions/${sessionId}`)
    if (res.ok()) {
      const body = (await res.json()) as {
        id: number
        status: string
        claimed_at: string | null
        closed_at: string | null
      }
      if (body.status === targetStatus) return body
    }
    await page.waitForTimeout(CLI_POLL_INTERVAL)
  }
  throw new Error(
    `Session ${sessionId} did not reach status "${targetStatus}" within ${timeoutMs}ms`,
  )
}

// ─── Daemon claim ──────────────────────────────────────────────────────────────

test.describe('CLI runner — daemon claim', () => {
  test('daemon claims an open session', async ({ page }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Claim Test',
      initial_prompt: 'Please process this.',
    })
    expect(session.status).toBe('open')

    const claimed = await waitForSessionStatus(page, session.id, 'claimed')
    expect(claimed.claimed_at).toBeTruthy()
  })
})

// ─── Daemon close ──────────────────────────────────────────────────────────────

test.describe('CLI runner — daemon close', () => {
  test('daemon closes a session after processing', async ({ page }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Close Test',
      initial_prompt: 'Process and finish this.',
    })

    const closed = await waitForSessionStatus(page, session.id, 'closed')
    expect(closed.closed_at).toBeTruthy()
  })
})

// ─── Session detail UI ────────────────────────────────────────────────────────

test.describe('CLI runner — session detail UI', () => {
  test('session detail page shows daemon has picked up the session', async ({ page }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'UI Status Test',
      initial_prompt: 'Check status in the UI.',
    })

    // Wait for daemon to claim before navigating (ensures page won't show Open)
    await waitForSessionStatus(page, session.id, 'claimed')

    await page.goto(`/agent-sessions/${session.id}`)

    // Wait for page content to load (skeleton disappears when heading appears)
    await expect(page.getByRole('heading', { name: 'UI Status Test' })).toBeVisible()

    // Session was claimed (may already be closed by the time page renders — both are valid)
    await expect(page.getByText(/^(Claimed|Closed)$/)).toBeVisible()
    await expect(page.getByText('Open')).not.toBeVisible()
  })
})

// ─── Full e2e UI flow ─────────────────────────────────────────────────────────

test.describe('CLI runner — full e2e UI flow', () => {
  test('user creates session via UI form, daemon processes it, UI shows Closed with messages', async ({
    page,
  }) => {
    await loginSeedUser(page)

    // Step 1: Create a session through the frontend form
    await page.goto('/agent-sessions/new')
    await page.getByLabel('Title').fill('E2E CLI Test')
    await page.locator('[data-slot="select-trigger"]').click()
    // "Test Runner" is the agent created during test setup (step 7)
    await page.getByRole('option', { name: 'Test Runner' }).click()
    await page.getByLabel('Initial Prompt').fill('E2E prompt for mock provider.')
    await page.getByRole('button', { name: 'Start Session' }).click()

    // Step 2: Should redirect to the session detail page
    await expect(page).toHaveURL(/\/agent-sessions\/\d+/)
    const sessionId = Number(page.url().split('/').pop())

    // Step 3: Initially Open
    await expect(page.getByRole('heading', { name: 'E2E CLI Test' })).toBeVisible()
    await expect(page.getByText('Open')).toBeVisible()

    // Step 4: Wait for daemon to process and close the session
    await waitForSessionStatus(page, sessionId, 'closed')

    // Step 5: Reload — status should now reflect Closed
    await page.reload()
    await expect(page.getByRole('heading', { name: 'E2E CLI Test' })).toBeVisible()
    await expect(page.getByText('Closed')).toBeVisible()
    await expect(page.getByText('Open')).not.toBeVisible()

    // Step 6: Messages from the mock provider should be visible in the feed
    await expect(page.getByText('Task completed successfully.')).toBeVisible()
    await expect(page.getByText(/\[MockProvider\].*completed the task/)).toBeVisible()
  })
})
