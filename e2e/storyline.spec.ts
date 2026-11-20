/** End-to-end flow: register, build a small book, create a contradicting connection and acknowledge its hint. */
import { expect, test } from '@playwright/test';

test('storyline flow with contradiction hint', async ({ page }) => {
  const email = `author-${Date.now()}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Testbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Testbuch' }).click();

  // Three time points, renamed by position (new points all start as „Neuer Zeitpunkt“).
  const names = page.getByLabel(/^Name Zeitpunkt /);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: '+ Zeitpunkt' }).click();
    await expect(names).toHaveCount(i);
  }
  for (const [i, name] of ['Tag 1', 'Tag 2', 'Tag 3'].entries()) {
    const input = names.nth(i);
    await input.fill(name);
    await input.blur();
    await expect(page.getByLabel(`Name Zeitpunkt ${name}`)).toBeVisible();
  }

  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });

  // Main strand „Annas Flucht“, Tag 2 – Tag 3.
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  await panel.getByLabel('Titel').fill('Annas Flucht');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 2' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 3' });
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('button', { name: 'Storyline „Annas Flucht“' })).toBeVisible();

  // Side strand „Der Brief“, Tag 1 – Tag 1.
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  await panel.getByLabel('Titel').fill('Der Brief');
  await panel.getByLabel('Nebenstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 1' });
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('button', { name: 'Storyline „Der Brief“' })).toBeVisible();

  // Connect Annas Flucht -> Der Brief as Zeitsprung via the panel.
  await page.getByRole('button', { name: 'Storyline „Annas Flucht“' }).click();
  await panel.getByLabel('Verbinden mit …').selectOption({ label: 'Der Brief' });
  await panel.getByRole('button', { name: 'Verbinden', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Verbindung' });
  await dialog.getByLabel('Art').selectOption({ label: 'Zeitsprung' });
  await expect(dialog.getByText('Zeitsprung: „Der Brief“ beginnt nicht nach dem Ende von „Annas Flucht“.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  const path = page.getByRole('button', { name: 'Verbindung „Annas Flucht“ → „Der Brief“' });
  await expect(path).toHaveAttribute('data-hint-state', 'open');

  // Acknowledge the hint.
  await path.focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Bewusst so' }).click();
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(path).toHaveAttribute('data-hint-state', 'acknowledged');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Verbindung „Annas Flucht“ → „Der Brief“' })).toHaveAttribute(
    'data-hint-state',
    'acknowledged',
  );
});
