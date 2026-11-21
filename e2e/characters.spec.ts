/** End-to-end flow: character profile, storyline addition, fake-AI warning in the hint list and acknowledging it. */
import { expect, test } from '@playwright/test';

test('character profile with AI warning flow', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `characters-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Figurenbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Figurenbuch' }).click();

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

  // Character with a behaviour.
  await page.getByRole('tab', { name: 'Figuren' }).click();
  await page.getByRole('button', { name: 'Figur', exact: true }).click();
  const name = page.getByLabel('Name Figur Neue Figur', { exact: true });
  await expect(name).toBeVisible();
  await name.fill('Anna');
  await name.blur();
  const behavior = page.getByLabel('Verhalten Figur Anna', { exact: true });
  await behavior.fill('Anna ist mutig.');
  await behavior.blur();

  // Storyline linking the character.
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });
  await panel.getByLabel('Titel', { exact: true }).fill('Annas Flucht');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 2' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('button', { name: 'Storyline „Annas Flucht“' }).click();

  // Edit mode saves on change, so the checkbox only flips after the round trip (no .check()).
  const linked = panel.getByRole('group', { name: 'Figuren' }).getByRole('checkbox', { name: 'Anna' });
  await linked.click();
  await expect(linked).toBeChecked();
  await panel.getByRole('button', { name: 'Ergänzung für Anna' }).click();
  const addition = panel.getByLabel('Verhalten Ergänzung Anna', { exact: true });
  // The addition textareas span the editor's full content width (they do not shrink to their cols).
  const widthRatio = await addition.evaluate((el) => {
    const editor = el.closest('.addition-editor')!;
    const cs = getComputedStyle(editor);
    return el.getBoundingClientRect().width / (editor.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  });
  expect(widthRatio).toBeGreaterThan(0.99);
  await addition.fill('Hier zögert sie.');
  await addition.blur();

  // A storyline text with the fake AI trigger starts a check after the quiet period.
  const description = panel.locator('textarea').first()  // the storyline's own description, above the section form;
  await description.fill('Anna flieht. FAKE-WIDERSPRUCH');
  await description.blur();

  const hints = page.getByRole('region', { name: 'Hinweise im Buch' });
  await expect(hints.getByText('Fake: Verhalten weicht ab.')).toBeVisible({ timeout: 20_000 });

  await hints.getByRole('button', { name: 'Bewusst so' }).click();
  await expect(hints.getByText(/1 bewusst so belassen/)).toBeVisible();
  await expect(hints.getByRole('button', { name: 'Bewusst so' })).toBeHidden();
  await hints.getByText(/1 bewusst so belassen/).click();
  await expect(hints.getByRole('button', { name: 'Wieder anzeigen' })).toBeVisible();
});
