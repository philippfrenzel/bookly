/** End-to-end flow: the new editor in the manuscript (fake AI): @mention of a character and the magic wand on a Baustein's text. */
import { expect, test } from '@playwright/test';
import { expectProse } from './prose';

test('manuscript text with mention and magic wand', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `mswand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Seebuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Seebuch' }).click();

  // Two time points, a character and a storyline: enough for a structure proposal.
  const names = page.getByLabel(/^Name Zeitpunkt /);
  for (let i = 1; i <= 2; i++) {
    await page.getByRole('button', { name: 'Zeitpunkt', exact: true }).click();
    await expect(names).toHaveCount(i);
  }
  for (const [i, tp] of ['Tag 1', 'Tag 2'].entries()) {
    await names.nth(i).fill(tp);
    await names.nth(i).blur();
    await expect(page.getByLabel(`Name Zeitpunkt ${tp}`)).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Figuren' }).click();
  await page.getByRole('button', { name: 'Figur', exact: true }).click();
  const name = page.getByLabel('Name Figur Neue Figur', { exact: true });
  await name.fill('Lena');
  await name.blur();
  await expect(page.getByLabel('Name Figur Lena', { exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  await panel.getByLabel('Titel', { exact: true }).fill('Heimkehr');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 2' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();

  // Manuscript: accept the AI structure, then edit the first Baustein.
  await page.getByRole('link', { name: 'Manuskript' }).click();
  await page.getByRole('button', { name: 'Struktur vorschlagen' }).click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByRole('button', { name: 'Bearbeiten' }).first().click();

  const text = page.getByRole('form', { name: /bearbeiten$/ }).getByLabel('Text', { exact: true });
  await text.click();
  await page.keyboard.type('Am Steg wartete @Le');
  await page.getByRole('option', { name: /@Lena/ }).click();
  await page.keyboard.type(' auf das Boot.');
  await expectProse(text, 'Am Steg wartete Lena auf das Boot.');
  await expect(text.locator('.cm-mention')).toHaveText('Lena');

  // The wand works here as everywhere: the suggestion is shown as a change, Tab takes it.
  await page.getByRole('button', { name: 'KI-Assistent: Text', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stil verbessern' }).click();
  await expect(text.locator('.cm-ai-ins')).toHaveText('KI-Vorschlag 1');
  await page.keyboard.press('Tab');
  await expectProse(text, 'KI-Vorschlag 1');
});
