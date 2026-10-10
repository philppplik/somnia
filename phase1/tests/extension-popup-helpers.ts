import {expect, type Page} from '@playwright/test';

/** Open the shipped app popup, not the Store's fixture-only host. */
export async function openExtensions(page: Page) {
 await page.goto('/');
 await page.getByRole('button', {name: 'Extensions', exact: true}).click();
 await expect(page.locator('.ext-popup')).toBeVisible();
}

export async function openAddExtension(page: Page) {
 await openExtensions(page);
 await page.getByRole('navigation', {name:'Extensions sections'}).getByRole('button', {name: '+ Add extension', exact: true}).click();
 await expect(page.getByLabel('somnia-extension.toml', {exact: true})).toBeVisible();
}

export async function enableExtension(page: Page, name: string) {
 const toggle = page.getByRole('switch', {name: `Enable ${name}`, exact: true});
 await expect(toggle).not.toBeChecked();
 await toggle.check();
 await expect(page.getByRole('switch', {name: `Disable ${name}`, exact: true})).toBeChecked();
}

export async function openExtensionDetails(page: Page, name: string) {
 await page.getByRole('button', {name: `Open ${name}`, exact: true}).click();
 await expect(page.getByRole('region', {name: 'Permissions', exact: true})).toBeVisible();
}
