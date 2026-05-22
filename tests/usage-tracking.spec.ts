import { test, expect } from '@playwright/test'

const BACKEND = `http://localhost:${process.env.BACKEND_PORT ?? '7330'}`
const CLI_AGENT_ID = Number(process.env.CLI_AGENT_ID ?? '1')

const CLI_POLL_TIMEOUT = 25_000
const CLI_POLL_INTERVAL = 500

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
  return res.json() as Promise<{ id: number; status: string }>
}

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
      const body = (await res.json()) as { id: number; status: string }
      if (body.status === targetStatus) return body
    }
    await page.waitForTimeout(CLI_POLL_INTERVAL)
  }
  throw new Error(`Session ${sessionId} did not reach status "${targetStatus}" within ${timeoutMs}ms`)
}

// ─── Per-message inline token usage ──────────────────────────────────────────

test.describe('usage tracking — per-message inline tokens', () => {
  test('message feed shows inline token counts for each assistant message', async ({ page }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Usage Per-Message Test',
      initial_prompt: 'Test inline token counts.',
    })

    await waitForSessionStatus(page, session.id, 'closed')
    await page.goto(`/agent-sessions/${session.id}`)
    await page.reload()

    // Mock provider sends usage on messages 4, 5b, and 6
    // Format rendered by MessageFeed: "{n} in · {n} out"
    await expect(page.getByText('120 in · 38 out')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('80 in · 18 out')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('280 in · 64 out')).toBeVisible({ timeout: 5000 })
  })
})

// ─── Result message usage section ────────────────────────────────────────────

test.describe('usage tracking — result message usage section', () => {
  test('result message shows aggregate cost and token counts in emerald block', async ({
    page,
  }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Usage Result Section Test',
      initial_prompt: 'Test result usage section.',
    })

    await waitForSessionStatus(page, session.id, 'closed')
    await page.goto(`/agent-sessions/${session.id}`)
    await page.reload()

    // ResultMessage renders an emerald left-bordered block when usage is present
    const resultBlock = page.locator('.border-l-emerald-500')
    await expect(resultBlock).toBeVisible({ timeout: 5000 })

    // Total cost from mock result event: total_cost_usd = 0.0024
    await expect(resultBlock.getByText('Total cost: $0.0024')).toBeVisible()

    // Aggregate token counts: usage.input_tokens = 480, usage.output_tokens = 120
    await expect(resultBlock.getByText('480 input tokens')).toBeVisible()
    await expect(resultBlock.getByText('120 output tokens')).toBeVisible()

    // Model breakdown summary is present (collapsed by default)
    await expect(resultBlock.getByText('Model breakdown')).toBeVisible()
  })
})

// ─── Model breakdown expand/collapse ─────────────────────────────────────────

test.describe('usage tracking — model breakdown collapsible', () => {
  test('model breakdown expands to show per-model token rows', async ({ page }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Usage Model Breakdown Test',
      initial_prompt: 'Test model breakdown expansion.',
    })

    await waitForSessionStatus(page, session.id, 'closed')
    await page.goto(`/agent-sessions/${session.id}`)
    await page.reload()

    const resultBlock = page.locator('.border-l-emerald-500')
    await expect(resultBlock).toBeVisible({ timeout: 5000 })

    // Model names inside the result block's <details> should not be visible before expanding.
    // Scope to resultBlock to avoid strict-mode errors from the session usage card's table.
    await expect(resultBlock.getByText('claude-opus-4-7-20251101')).not.toBeVisible()
    await expect(resultBlock.getByText('claude-haiku-4-5-20251001')).not.toBeVisible()

    // Click the "Model breakdown" summary inside the result block to expand
    await resultBlock.getByText('Model breakdown').click()

    // Both models from mock model_usage should now be visible inside the result block
    await expect(resultBlock.getByText('claude-opus-4-7-20251101')).toBeVisible({ timeout: 3000 })
    await expect(resultBlock.getByText('claude-haiku-4-5-20251001')).toBeVisible({ timeout: 3000 })
  })
})

// ─── Session usage card ───────────────────────────────────────────────────────

test.describe('usage tracking — session usage card', () => {
  test('session page shows usage card with totals and model breakdown after close', async ({
    page,
  }) => {
    await loginSeedUser(page)

    const session = await apiCreateSession(page, {
      agent_id: CLI_AGENT_ID,
      title: 'Usage Session Card Test',
      initial_prompt: 'Test session usage card.',
    })

    await waitForSessionStatus(page, session.id, 'closed')
    await page.goto(`/agent-sessions/${session.id}`)
    await page.reload()

    // Session usage card — CardTitle renders as a <div>, not a heading role element
    const usageCardTitle = page.getByText('Session Usage', { exact: true })
    await expect(usageCardTitle).toBeVisible({ timeout: 5000 })

    // Scope assertions to the session usage card to avoid collisions with the result block
    const usageCard = usageCardTitle.locator('../..')
    await expect(usageCard.getByText('$0.0024')).toBeVisible()

    // Input and output token totals
    await expect(usageCard.getByText('480')).toBeVisible()
    await expect(usageCard.getByText('120')).toBeVisible()

    // Cache read tokens: 4000 → rendered as "4,000" via toLocaleString()
    await expect(usageCard.getByText('4,000')).toBeVisible()

    // Model breakdown table should have 2 data rows (one per model)
    const modelRows = usageCard.locator('table tbody tr')
    await expect(modelRows).toHaveCount(2)
  })
})
