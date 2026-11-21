/** End-to-end flow: writing aids in a text field (fake AI): @mention of a character, reviewer hint, typing assistant. */
import { expect, test } from '@playwright/test';
import { expectProse } from './prose';

test('writing aids: mention, hint, typing assistant', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `aids-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Hilfenbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Hilfenbuch' }).click();

  // Two characters: Anna, then Ben.
  await page.getByRole('tab', { name: 'Figuren' }).click();
  for (const n of ['Anna', 'Ben']) {
    await page.getByRole('button', { name: 'Figur', exact: true }).click();
    const name = page.getByLabel('Name Figur Neue Figur', { exact: true });
    await name.fill(n);
    await name.blur();
    await expect(page.getByLabel(`Name Figur ${n}`, { exact: true })).toBeVisible();
  }

  // "@" offers the characters; choosing one inserts the plain name, which is then tinted.
  const field = page.getByLabel('Beschreibung Figur Ben', { exact: true });
  await field.click();
  await page.keyboard.type('Bruder von @An');
  await page.getByRole('option', { name: /@Anna/ }).click();
  await expectProse(field, 'Bruder von Anna');
  await expect(field.locator('.cm-mention')).toHaveText('Anna');

  // A filler word gets a wavy underline (reviewer hints are on by default).
  await page.keyboard.type(', eigentlich ruhig');
  await expect(field.locator('.cm-hint-filler')).toHaveText('eigentlich');

  // Typing assistant: switch it on in the wand menu, pause after typing, Tab takes the grey continuation.
  await page.getByRole('button', { name: 'KI-Assistent: Beschreibung Figur Ben', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Schreibhilfe beim Tippen' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Schreibhilfe beim Tippen' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await field.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('.');
  const ghost = field.locator('.cm-ghost');
  await expect(ghost).toHaveText(' KI-Vorschlag 1');
  await expectProse(field, 'Bruder von Anna, eigentlich ruhig.');
  await page.keyboard.press('Tab');
  await expect(ghost).toHaveCount(0);
  await expectProse(field, 'Bruder von Anna, eigentlich ruhig. KI-Vorschlag 1');
});
