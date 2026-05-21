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

async function apiCreateApiKey(page: import('@playwright/test').Page) {
  const res = await page.context().request.post(`${BACKEND}/api-keys`)
  if (!res.ok()) throw new Error(`API create key failed: ${res.status()} ${await res.text()}`)
  return res.json() as Promise<{
    id: number
    display_prefix: string
    key: string
    created_at: string
    revoked_at: string | null
  }>
}

// ─── Header and settings navigation ──────────────────────────────────────────

test.describe('Header and settings navigation', () => {
  test('avatar shows first letter of email as initial', async ({ page }) => {
    const email = uid('avatar')
    await loginAs(page, email, 'password123')
    await page.goto('/agents')

    const initial = email[0].toUpperCase()
    await expect(page.getByRole('button', { name: 'Open user menu' }).getByText(initial)).toBeVisible()
  })

  test('avatar dropdown shows user email', async ({ page }) => {
    const email = uid('dropdown-email')
    await loginAs(page, email, 'password123')
    await page.goto('/agents')

    await page.getByRole('button', { name: 'Open user menu' }).click()
    await expect(page.getByText(email)).toBeVisible()
  })

  test('navigates to settings from avatar dropdown', async ({ page }) => {
    await loginAs(page, uid('nav-settings'), 'password123')
    await page.goto('/agents')

    await page.getByRole('button', { name: 'Open user menu' }).click()
    await page.getByRole('link', { name: 'Settings' }).click()

    await expect(page).toHaveURL('/settings/profile')
  })
})

// ─── Settings sidebar navigation ─────────────────────────────────────────────

test.describe('Settings sidebar navigation', () => {
  test('Profile link is active on profile page', async ({ page }) => {
    await loginAs(page, uid('sidebar-profile'), 'password123')
    await page.goto('/settings/profile')

    const profileLink = page.getByRole('link', { name: 'Profile' })
    await expect(profileLink).toHaveClass(/bg-sidebar-accent/)
  })

  test('API Keys link navigates to api-keys page', async ({ page }) => {
    await loginAs(page, uid('sidebar-apikeys'), 'password123')
    await page.goto('/settings/profile')

    await page.getByRole('link', { name: 'API Keys' }).click()

    await expect(page).toHaveURL('/settings/api-keys')
  })

  test('API Keys link is active on api-keys page', async ({ page }) => {
    await loginAs(page, uid('sidebar-active'), 'password123')
    await page.goto('/settings/api-keys')

    const apiKeysLink = page.getByRole('link', { name: 'API Keys' })
    await expect(apiKeysLink).toHaveClass(/bg-sidebar-accent/)
  })

  test('Profile page shows the logged-in user email', async ({ page }) => {
    const email = uid('profile-email')
    await loginAs(page, email, 'password123')
    await page.goto('/settings/profile')

    await expect(page.getByText(email)).toBeVisible()
  })
})

// ─── API Keys – empty state ───────────────────────────────────────────────────

test.describe('API Keys – empty state', () => {
  test('shows empty state when no keys exist', async ({ page }) => {
    await loginAs(page, uid('empty-state'), 'password123')
    await page.goto('/settings/api-keys')

    await expect(page.getByText('No API keys yet.')).toBeVisible()
  })
})

// ─── API Keys – generate ──────────────────────────────────────────────────────

test.describe('API Keys – generate', () => {
  test('clicking Generate shows one-time reveal banner', async ({ page }) => {
    await loginAs(page, uid('gen-banner'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()

    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()
  })

  test('banner contains a non-empty key in a code block', async ({ page }) => {
    await loginAs(page, uid('gen-key-visible'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()

    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    // The full key is displayed in a <code> element inside the banner
    const banner = page.locator('.bg-yellow-50, .bg-yellow-950\\/30').first()
    const keyCode = banner.locator('code')
    const keyText = await keyCode.textContent()
    expect(keyText).toBeTruthy()
    expect(keyText!.trim().length).toBeGreaterThan(0)
  })

  test('copy button shows checkmark feedback after click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginAs(page, uid('gen-copy'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  })

  test('dismissing the banner removes it', async ({ page }) => {
    await loginAs(page, uid('gen-dismiss'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).not.toBeVisible()
  })

  test('generated key appears in the list with a masked prefix', async ({ page }) => {
    await loginAs(page, uid('gen-listed'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    // A key card should appear in the list (display_prefix + ellipsis)
    await expect(page.locator('[data-slot="card"]')).toBeVisible()
  })

  test('generated key shows Active badge', async ({ page }) => {
    await loginAs(page, uid('gen-active'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    await expect(page.locator('[data-slot="card"]').first().getByText('Active')).toBeVisible()
  })

  test('key appears in list after page reload without banner', async ({ page }) => {
    await loginAs(page, uid('gen-reload'), 'password123')
    await page.goto('/settings/api-keys')

    await page.getByRole('button', { name: 'Generate new key' }).click()
    await expect(page.getByText('Copy your new key now — it will not be shown again.')).toBeVisible()

    await page.reload()

    await expect(page.getByText('Copy your new key now — it will not be shown again.')).not.toBeVisible()
    await expect(page.locator('[data-slot="card"]')).toBeVisible()
  })
})

// ─── API Keys – revoke ────────────────────────────────────────────────────────

test.describe('API Keys – revoke', () => {
  test('clicking Revoke opens confirmation dialog', async ({ page }) => {
    await loginAs(page, uid('rev-dialog'), 'password123')
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    await page.locator('[data-slot="card"]').first().getByRole('button', { name: 'Revoke' }).click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('Any requests using this key will immediately stop working. This cannot be undone.')).toBeVisible()
  })

  test('cancelling dialog keeps key as Active', async ({ page }) => {
    await loginAs(page, uid('rev-cancel'), 'password123')
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    const card = page.locator('[data-slot="card"]').first()
    await card.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('alertdialog')).not.toBeVisible()
    await expect(card.getByText('Active')).toBeVisible()
  })

  test('confirming revoke changes badge to Revoked', async ({ page }) => {
    await loginAs(page, uid('rev-confirm'), 'password123')
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    const card = page.locator('[data-slot="card"]').first()
    await card.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Click the Revoke button inside the dialog (destructive action)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click()

    await expect(card.getByText('Revoked')).toBeVisible()
    await expect(card.getByText('Active')).not.toBeVisible()
  })

  test('Revoke button is disabled after revocation', async ({ page }) => {
    await loginAs(page, uid('rev-disabled'), 'password123')
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    const card = page.locator('[data-slot="card"]').first()
    await card.getByRole('button', { name: 'Revoke' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click()

    await expect(card.getByText('Revoked')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Revoke' })).toBeDisabled()
  })

  test('revoked state persists after page reload', async ({ page }) => {
    await loginAs(page, uid('rev-persist'), 'password123')
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    const card = page.locator('[data-slot="card"]').first()
    await card.getByRole('button', { name: 'Revoke' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click()
    await expect(card.getByText('Revoked')).toBeVisible()

    await page.reload()

    await expect(page.locator('[data-slot="card"]').first().getByText('Revoked')).toBeVisible()
  })

  test('only the targeted key is revoked when multiple exist', async ({ page }) => {
    await loginAs(page, uid('rev-targeted'), 'password123')

    // Create two keys via API
    await apiCreateApiKey(page)
    await apiCreateApiKey(page)
    await page.goto('/settings/api-keys')

    const cards = page.locator('[data-slot="card"]')
    await expect(cards).toHaveCount(2)

    // Revoke the second (last) key
    await cards.last().getByRole('button', { name: 'Revoke' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click()

    await expect(cards.last().getByText('Revoked')).toBeVisible()
    await expect(cards.first().getByText('Active')).toBeVisible()
  })
})
