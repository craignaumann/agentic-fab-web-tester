import { test, expect, request as makeRequest } from '@playwright/test'

const BACKEND = `http://localhost:${process.env.BACKEND_PORT ?? '7330'}`

// Unique email per call — prevents cross-test collisions in the shared DB.
function uid(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.example`
}

// Register a user directly via the API (no browser involvement).
async function apiRegister(email: string, password: string) {
  const ctx = await makeRequest.newContext()
  const res = await ctx.post(`${BACKEND}/auth`, { data: { email, password } })
  await ctx.dispose()
  if (!res.ok()) throw new Error(`API register failed: ${res.status()} ${await res.text()}`)
}

// ─── Register ────────────────────────────────────────────────────────────────

test.describe('Register', () => {
  test('happy path: valid credentials redirect to login', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill(uid('reg'))
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL('/login')
  })

  test('mismatched passwords shows validation error', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill(uid('mismatch'))
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('different456')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()
    await expect(page).toHaveURL('/register')
  })

  test('short password shows validation error', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill(uid('short'))
    await page.getByLabel('Password', { exact: true }).fill('abc')
    await page.getByLabel('Confirm password').fill('abc')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible()
    await expect(page).toHaveURL('/register')
  })

  test('invalid email format shows validation error', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Invalid email address')).toBeVisible()
    await expect(page).toHaveURL('/register')
  })

  test('duplicate email shows error without redirect', async ({ page }) => {
    const email = uid('dup')
    await apiRegister(email, 'password123')

    await page.goto('/register')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('An account with that email already exists.')).toBeVisible()
    await expect(page).toHaveURL('/register')
  })
})

// ─── Login ───────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test('happy path: valid credentials redirect to /agents', async ({ page }) => {
    const email = uid('login')
    await apiRegister(email, 'password123')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/agents')
  })

  test('wrong password shows error', async ({ page }) => {
    const email = uid('wrongpw')
    await apiRegister(email, 'password123')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Unauthorized')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('unknown email shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(uid('nobody'))
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Unauthorized')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated visit to /agents redirects to /login', async ({ page }) => {
    await page.goto('/agents')
    await expect(page).toHaveURL('/login')
  })
})

// ─── Logout ──────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('logout button redirects to /login', async ({ page }) => {
    const email = uid('logout')
    await apiRegister(email, 'password123')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/agents')

    await page.getByRole('button', { name: 'Open user menu' }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')
  })

  test('session is cleared after logout: /agents redirects to /login', async ({ page }) => {
    const email = uid('logout-session')
    await apiRegister(email, 'password123')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/agents')

    await page.getByRole('button', { name: 'Open user menu' }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/login')

    await page.goto('/agents')
    await expect(page).toHaveURL('/login')
  })
})
