/** End-to-end flow: the AI magic wand on a storyline description (fake AI): suggest, cycle, keep, save on blur, restore with Escape. */
import { expect, test } from '@playwright/test';

test('magic wand on a storyline description', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `wand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Zauberbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Zauberbuch' }).click();

  // Two time points, renamed by position (new points all start as „Neuer Zeitpunkt“).
  const names = page.getByLabel(/^Name Zeitpunkt /);
  for (let i = 1; i <= 2; i++) {
    await page.getByRole('button', { name: 'Zeitpunkt', exact: true }).click();
    await expect(names).toHaveCount(i);
  }
  for (const [i, tp] of ['Tag 1', 'Tag 2'].entries()) {
    const input = names.nth(i);
    await input.fill(tp);
    await input.blur();
    await expect(page.getByLabel(`Name Zeitpunkt ${tp}`)).toBeVisible();
  }

  // Storyline „Flucht“.
  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  await panel.getByLabel('Titel', { exact: true }).fill('Flucht');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 2' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('button', { name: 'Storyline „Flucht“' }).click();

  // Rewrite the description with the wand.
  const description = panel.getByLabel('Kurzbeschreibung', { exact: true });
  await description.fill('Mira geht.');
  await description.blur();

  await panel.getByRole('button', { name: 'KI-Assistent: Kurzbeschreibung', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Umformulieren' }).click();
  await expect(description).toHaveValue('KI-Vorschlag 1');

  await page.getByRole('button', { name: 'Nächster Vorschlag' }).click();
  await expect(description).toHaveValue('KI-Vorschlag 2');

  // Leaving the field keeps the suggestion and closes the bar.
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok());
  await panel.getByLabel('Titel', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nächster Vorschlag' })).toBeHidden();

  // The blur saved it (wait for the PATCH so the reload cannot abort it).
  await saved;
  await page.reload();
  await page.getByRole('button', { name: 'Storyline „Flucht“' }).click();
  await expect(panel.getByLabel('Kurzbeschreibung', { exact: true })).toHaveValue('KI-Vorschlag 2');

  // Selection: Escape restores the original text.
  const reopened = panel.getByLabel('Kurzbeschreibung', { exact: true });
  await reopened.focus();
  await reopened.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, el.value.length));
  await panel.getByRole('button', { name: 'KI-Assistent: Kurzbeschreibung', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stil verbessern' }).click();
  await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
  await expect(reopened).not.toHaveValue('KI-Vorschlag 2');
  await page.keyboard.press('Escape');
  await expect(reopened).toHaveValue('KI-Vorschlag 2');
});
