import { expect, test } from '@playwright/test';

const password = process.env.E2E_USER_PASSWORD ?? '123456';
const email = process.env.E2E_USER_EMAIL ?? `e2e-${Date.now()}@example.com`;

test('register Project A, then use SSO in Project B', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Register', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Authenticated').first()).toBeVisible();
	await page.getByRole('button', { name: 'Login', exact: true }).nth(1).click();
	await expect(page.getByText('Authenticated').nth(1)).toBeVisible();
	await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('session view and global logout synchronize client cards', async ({ page }) => {
	test.skip(!process.env.E2E_USER_EMAIL, 'Requires a seeded E2E account');
	await page.goto('/');
	await page.getByRole('button', { name: 'Login', exact: true }).first().click();
	await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL ?? '');
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.getByRole('button', { name: 'View sessions' }).first().click();
	await expect(page.getByText(/Last active/).first()).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Logout everywhere' }).first().click();
	await expect(page.getByText('Anonymous').first()).toBeVisible();
});
