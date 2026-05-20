import { test, expect, request as makeRequest } from '@playwright/test'

const BACKEND = `http://localhost:${process.env.BACKEND_PORT ?? '7330'}`

function uid(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.example`
}

// Register a user and log them in via the UI, returning the logged-in page.
async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  const ctx = await makeRequest.newContext()
  const res = await ctx.post(`${BACKEND}/auth`, { data: { email, password } })
  await ctx.dispose()
  if (!res.ok()) throw new Error(`API register failed: ${res.status()} ${await res.text()}`)

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/agents')
}

// Create an agent directly via the API (authenticated session from page's cookies).
async function apiCreateAgent(
  page: import('@playwright/test').Page,
  data: { name: string; expertise: string; system_prompt: string },
) {
  const ctx = await page.context().request
  const res = await ctx.post(`${BACKEND}/agents`, { data })
  if (!res.ok()) throw new Error(`API create agent failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{ id: number; name: string; expertise: string; system_prompt: string }>
}

// ─── View agents ─────────────────────────────────────────────────────────────

test.describe('View agents', () => {
  test('empty state shows prompt to create first agent', async ({ page }) => {
    await loginAs(page, uid('view-empty'), 'password123')
    await page.goto('/agents')

    await expect(page.getByText('No agents yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create your first agent' })).toBeVisible()
  })

  test('lists agents belonging to the logged-in user', async ({ page }) => {
    await loginAs(page, uid('view-list'), 'password123')

    await apiCreateAgent(page, {
      name: 'Support Bot',
      expertise: 'Customer support',
      system_prompt: 'You help customers resolve issues.',
    })
    await apiCreateAgent(page, {
      name: 'Code Reviewer',
      expertise: 'TypeScript',
      system_prompt: 'You review pull requests.',
    })

    await page.goto('/agents')

    await expect(page.getByText('Support Bot')).toBeVisible()
    await expect(page.getByText('Code Reviewer')).toBeVisible()
  })

  test('agents from another user are not visible', async ({ page, browser }) => {
    const emailA = uid('view-isolation-a')
    const emailB = uid('view-isolation-b')

    // User A creates an agent
    await loginAs(page, emailA, 'password123')
    await apiCreateAgent(page, {
      name: 'Private Agent',
      expertise: 'Secrets',
      system_prompt: 'Only user A should see this.',
    })

    // User B logs in via a separate browser context
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await loginAs(pageB, emailB, 'password123')
    await pageB.goto('/agents')

    await expect(pageB.getByText('Private Agent')).not.toBeVisible()
    await expect(pageB.getByText('No agents yet.')).toBeVisible()

    await ctxB.close()
  })

  test('"New Agent" button navigates to /agents/new', async ({ page }) => {
    await loginAs(page, uid('view-nav'), 'password123')
    await page.goto('/agents')

    await page.getByRole('button', { name: 'New Agent' }).click()
    await expect(page).toHaveURL('/agents/new')
  })
})

// ─── Add agent ───────────────────────────────────────────────────────────────

test.describe('Add agent', () => {
  test('happy path: creates agent and redirects to /agents', async ({ page }) => {
    await loginAs(page, uid('add-happy'), 'password123')
    await page.goto('/agents/new')

    await page.getByLabel('Name').fill('Research Assistant')
    await page.getByLabel('Expertise').fill('Academic research')
    await page.getByLabel('System Prompt').fill('You help researchers find and summarize papers.')
    await page.getByRole('button', { name: 'Create Agent' }).click()

    await expect(page).toHaveURL('/agents')
    await expect(page.getByText('Research Assistant')).toBeVisible()
  })

  test('new agent card shows name, expertise badge, and system prompt', async ({ page }) => {
    await loginAs(page, uid('add-card'), 'password123')
    await page.goto('/agents/new')

    await page.getByLabel('Name').fill('Data Analyst')
    await page.getByLabel('Expertise').fill('Python, SQL')
    await page.getByLabel('System Prompt').fill('You analyse datasets and produce insights.')
    await page.getByRole('button', { name: 'Create Agent' }).click()

    await expect(page).toHaveURL('/agents')

    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Data Analyst' })
    await expect(card.getByText('Data Analyst')).toBeVisible()
    await expect(card.getByText('Python, SQL')).toBeVisible()
    await expect(card.getByText('You analyse datasets and produce insights.')).toBeVisible()
  })

  test('missing name shows validation error', async ({ page }) => {
    await loginAs(page, uid('add-no-name'), 'password123')
    await page.goto('/agents/new')

    await page.getByLabel('Expertise').fill('TypeScript')
    await page.getByLabel('System Prompt').fill('Some prompt.')
    await page.getByRole('button', { name: 'Create Agent' }).click()

    await expect(page.getByText('Name is required')).toBeVisible()
    await expect(page).toHaveURL('/agents/new')
  })

  test('missing expertise shows validation error', async ({ page }) => {
    await loginAs(page, uid('add-no-exp'), 'password123')
    await page.goto('/agents/new')

    await page.getByLabel('Name').fill('Bot')
    await page.getByLabel('System Prompt').fill('Some prompt.')
    await page.getByRole('button', { name: 'Create Agent' }).click()

    await expect(page.getByText('Expertise is required')).toBeVisible()
    await expect(page).toHaveURL('/agents/new')
  })

  test('missing system prompt shows validation error', async ({ page }) => {
    await loginAs(page, uid('add-no-prompt'), 'password123')
    await page.goto('/agents/new')

    await page.getByLabel('Name').fill('Bot')
    await page.getByLabel('Expertise').fill('Python')
    await page.getByRole('button', { name: 'Create Agent' }).click()

    await expect(page.getByText('System prompt is required')).toBeVisible()
    await expect(page).toHaveURL('/agents/new')
  })

  test('"Create your first agent" button navigates to /agents/new', async ({ page }) => {
    await loginAs(page, uid('add-empty-cta'), 'password123')
    await page.goto('/agents')

    await page.getByRole('button', { name: 'Create your first agent' }).click()
    await expect(page).toHaveURL('/agents/new')
  })
})

// ─── Delete agent ─────────────────────────────────────────────────────────────

test.describe('Delete agent', () => {
  test('happy path: delete removes agent from the list', async ({ page }) => {
    await loginAs(page, uid('del-happy'), 'password123')
    await apiCreateAgent(page, {
      name: 'Temporary Bot',
      expertise: 'Nothing',
      system_prompt: 'I will be deleted.',
    })

    await page.goto('/agents')
    await expect(page.getByText('Temporary Bot')).toBeVisible()

    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Temporary Bot' })
    await card.getByRole('button', { name: 'Delete' }).click()

    // Confirmation dialog
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('Delete Temporary Bot?')).toBeVisible()
    await expect(page.getByText('This action cannot be undone.')).toBeVisible()

    await page.getByRole('button', { name: 'Delete' }).last().click()

    await expect(page.getByText('Temporary Bot')).not.toBeVisible()
    await expect(page.getByText('No agents yet.')).toBeVisible()
  })

  test('cancel button in confirmation dialog keeps the agent', async ({ page }) => {
    await loginAs(page, uid('del-cancel'), 'password123')
    await apiCreateAgent(page, {
      name: 'Keeper Bot',
      expertise: 'Persisting',
      system_prompt: 'I should survive the cancel.',
    })

    await page.goto('/agents')

    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Keeper Bot' })
    await card.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('alertdialog')).not.toBeVisible()
    await expect(card).toBeVisible()
  })

  test('only the targeted agent is removed when multiple agents exist', async ({ page }) => {
    await loginAs(page, uid('del-targeted'), 'password123')
    await apiCreateAgent(page, {
      name: 'Agent Alpha',
      expertise: 'Alpha stuff',
      system_prompt: 'First agent.',
    })
    await apiCreateAgent(page, {
      name: 'Agent Beta',
      expertise: 'Beta stuff',
      system_prompt: 'Second agent — this one gets deleted.',
    })

    await page.goto('/agents')
    const cardAlpha = page.locator('[data-slot="card"]').filter({ hasText: 'Agent Alpha' })
    const cardBeta = page.locator('[data-slot="card"]').filter({ hasText: 'Agent Beta' })
    await expect(cardAlpha).toBeVisible()
    await expect(cardBeta).toBeVisible()

    await cardBeta.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete' }).last().click()

    await expect(page.getByRole('alertdialog')).not.toBeVisible()
    await expect(cardBeta).not.toBeVisible()
    await expect(cardAlpha).toBeVisible()
  })
})
