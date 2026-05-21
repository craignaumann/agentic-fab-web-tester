import { test, expect, request as makeRequest } from '@playwright/test'

const BACKEND = `http://localhost:${process.env.BACKEND_PORT ?? '7330'}`

function uid(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.example`
}

async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  const ctx = await makeRequest.newContext()
  const res = await ctx.post(`${BACKEND}/auth`, { data: { email, password } })
  if (!res.ok()) {
    const body = await res.text()
    await ctx.dispose()
    throw new Error(`API register failed: ${res.status()} ${body}`)
  }
  await ctx.dispose()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/agents')
}

async function apiCreateAgent(
  page: import('@playwright/test').Page,
  data: { name: string; expertise: string; system_prompt: string },
) {
  const res = await page.context().request.post(`${BACKEND}/agents`, { data })
  if (!res.ok()) throw new Error(`API create agent failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{ id: number; name: string; expertise: string; system_prompt: string }>
}

async function apiCreateSession(
  page: import('@playwright/test').Page,
  data: { agent_id: number; title: string; initial_prompt: string },
) {
  const res = await page.context().request.post(`${BACKEND}/agent-sessions`, { data })
  if (!res.ok()) throw new Error(`API create session failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{
    id: number
    user_id: number
    agent_id: number
    title: string
    initial_prompt: string
    status: string
    created_at: string
  }>
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

test.describe('Agent Sessions – sidebar nav', () => {
  test('Agent Sessions link is visible in the sidebar', async ({ page }) => {
    await loginAs(page, uid('nav-visible'), 'password123')
    await page.goto('/agents')

    await expect(page.getByRole('link', { name: 'Agent Sessions' })).toBeVisible()
  })

  test('Agent Sessions link navigates to /agent-sessions', async ({ page }) => {
    await loginAs(page, uid('nav-click'), 'password123')
    await page.goto('/agents')

    await page.getByRole('link', { name: 'Agent Sessions' }).click()

    await expect(page).toHaveURL('/agent-sessions')
  })

  test('Agent Sessions link is active on the sessions list page', async ({ page }) => {
    await loginAs(page, uid('nav-active'), 'password123')
    await page.goto('/agent-sessions')

    await expect(page.getByRole('link', { name: 'Agent Sessions' })).toHaveClass(/bg-sidebar-accent/)
  })
})

// ─── Empty state ─────────────────────────────────────────────────────────────

test.describe('View agent sessions – empty state', () => {
  test('shows empty state and CTA when no sessions exist', async ({ page }) => {
    await loginAs(page, uid('empty'), 'password123')
    await page.goto('/agent-sessions')

    await expect(page.getByText('No agent sessions yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start your first session' })).toBeVisible()
  })
})

// ─── List view ────────────────────────────────────────────────────────────────

test.describe('View agent sessions – list', () => {
  test('lists sessions belonging to the logged-in user', async ({ page }) => {
    await loginAs(page, uid('list-user'), 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'List Bot',
      expertise: 'Listing',
      system_prompt: 'You list things.',
    })

    await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Session Alpha',
      initial_prompt: 'Do something.',
    })
    await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Session Beta',
      initial_prompt: 'Do something else.',
    })

    await page.goto('/agent-sessions')

    await expect(page.getByText('Session Alpha')).toBeVisible()
    await expect(page.getByText('Session Beta')).toBeVisible()
  })

  test('each card shows title, agent name, and Open status badge', async ({ page }) => {
    await loginAs(page, uid('list-card'), 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'Card Bot',
      expertise: 'Cards',
      system_prompt: 'You display cards.',
    })
    await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'My Test Session',
      initial_prompt: 'Test prompt.',
    })

    await page.goto('/agent-sessions')

    const card = page.locator('[data-slot="card"]').filter({ hasText: 'My Test Session' })
    await expect(card.getByText('My Test Session')).toBeVisible()
    await expect(card.getByText('Card Bot')).toBeVisible()
    await expect(card.getByText('Open')).toBeVisible()
  })

  test('sessions from another user are not visible', async ({ page, browser }) => {
    const emailA = uid('isolation-a')
    const emailB = uid('isolation-b')

    await loginAs(page, emailA, 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'Private Bot',
      expertise: 'Secrets',
      system_prompt: 'You are private.',
    })
    await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Private Session',
      initial_prompt: 'Only user A should see this.',
    })

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await loginAs(pageB, emailB, 'password123')
    await pageB.goto('/agent-sessions')

    await expect(pageB.getByText('Private Session')).not.toBeVisible()
    await expect(pageB.getByText('No agent sessions yet.')).toBeVisible()

    await ctxB.close()
  })
})

// ─── New session – happy path ─────────────────────────────────────────────────

test.describe('New agent session – happy path', () => {
  test('creates a session and redirects to /agent-sessions/:id', async ({ page }) => {
    await loginAs(page, uid('create-happy'), 'password123')
    await apiCreateAgent(page, {
      name: 'Create Bot',
      expertise: 'Creating',
      system_prompt: 'You create things.',
    })

    await page.goto('/agent-sessions/new')

    await page.getByLabel('Title').fill('My New Session')
    await page.locator('[data-slot="select-trigger"]').click()
    await page.getByRole('option', { name: 'Create Bot' }).click()
    await page.getByLabel('Initial Prompt').fill('Please help me with this task.')
    await page.getByRole('button', { name: 'Start Session' }).click()

    await expect(page).toHaveURL(/\/agent-sessions\/\d+/)
  })

  test('"New Session" button navigates to /agent-sessions/new', async ({ page }) => {
    await loginAs(page, uid('new-btn'), 'password123')
    await page.goto('/agent-sessions')

    await page.getByRole('button', { name: 'New Session' }).click()

    await expect(page).toHaveURL('/agent-sessions/new')
  })

  test('"Start your first session" button navigates to /agent-sessions/new', async ({ page }) => {
    await loginAs(page, uid('cta-btn'), 'password123')
    await page.goto('/agent-sessions')

    await page.getByRole('button', { name: 'Start your first session' }).click()

    await expect(page).toHaveURL('/agent-sessions/new')
  })
})

// ─── New session – validation ─────────────────────────────────────────────────

test.describe('New agent session – validation', () => {
  test('missing title shows validation error', async ({ page }) => {
    await loginAs(page, uid('val-title'), 'password123')
    await apiCreateAgent(page, {
      name: 'Val Bot',
      expertise: 'Validation',
      system_prompt: 'You validate.',
    })

    await page.goto('/agent-sessions/new')

    await page.locator('[data-slot="select-trigger"]').click()
    await page.getByRole('option', { name: 'Val Bot' }).click()
    await page.getByLabel('Initial Prompt').fill('Some prompt.')
    await page.getByRole('button', { name: 'Start Session' }).click()

    await expect(page.getByText('Title is required')).toBeVisible()
    await expect(page).toHaveURL('/agent-sessions/new')
  })

  test('missing initial prompt shows validation error', async ({ page }) => {
    await loginAs(page, uid('val-prompt'), 'password123')
    await apiCreateAgent(page, {
      name: 'Prompt Val Bot',
      expertise: 'Validation',
      system_prompt: 'You validate.',
    })

    await page.goto('/agent-sessions/new')

    await page.getByLabel('Title').fill('Some title')
    await page.locator('[data-slot="select-trigger"]').click()
    await page.getByRole('option', { name: 'Prompt Val Bot' }).click()
    await page.getByRole('button', { name: 'Start Session' }).click()

    await expect(page.getByText('Initial prompt is required')).toBeVisible()
    await expect(page).toHaveURL('/agent-sessions/new')
  })

  test('missing agent shows validation error', async ({ page }) => {
    await loginAs(page, uid('val-agent'), 'password123')

    await page.goto('/agent-sessions/new')

    await page.getByLabel('Title').fill('Some title')
    await page.getByLabel('Initial Prompt').fill('Some prompt.')
    await page.getByRole('button', { name: 'Start Session' }).click()

    await expect(page.getByText('Agent is required')).toBeVisible()
    await expect(page).toHaveURL('/agent-sessions/new')
  })
})

// ─── View session ─────────────────────────────────────────────────────────────

test.describe('View agent session', () => {
  test('shows title, status badge, agent name, and initial prompt', async ({ page }) => {
    await loginAs(page, uid('view-detail'), 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'Detail Bot',
      expertise: 'Details',
      system_prompt: 'You show details.',
    })
    const session = await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Detail Session',
      initial_prompt: 'Show me the details.',
    })

    await page.goto(`/agent-sessions/${session.id}`)

    await expect(page.getByRole('heading', { name: 'Detail Session' })).toBeVisible()
    await expect(page.getByText('Open')).toBeVisible()
    await expect(page.getByText('Detail Bot')).toBeVisible()
    await expect(page.getByText('Show me the details.')).toBeVisible()
  })

  test('shows messages placeholder card', async ({ page }) => {
    await loginAs(page, uid('view-messages'), 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'Messages Bot',
      expertise: 'Messages',
      system_prompt: 'You handle messages.',
    })
    const session = await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Messages Session',
      initial_prompt: 'Check messages.',
    })

    await page.goto(`/agent-sessions/${session.id}`)

    await expect(
      page.getByText('Agent messages will appear here once the session is picked up.'),
    ).toBeVisible()
  })

  test('"View" button on a session card navigates to the session detail page', async ({ page }) => {
    await loginAs(page, uid('view-nav'), 'password123')
    const agent = await apiCreateAgent(page, {
      name: 'Nav Bot',
      expertise: 'Navigation',
      system_prompt: 'You navigate.',
    })
    const session = await apiCreateSession(page, {
      agent_id: agent.id,
      title: 'Nav Session',
      initial_prompt: 'Navigate me.',
    })

    await page.goto('/agent-sessions')

    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Nav Session' })
    await card.getByRole('button', { name: 'View' }).click()

    await expect(page).toHaveURL(`/agent-sessions/${session.id}`)
  })
})
