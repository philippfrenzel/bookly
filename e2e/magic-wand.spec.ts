/** End-to-end flow: the AI magic wand on a storyline description (fake AI): suggest, cycle, keep, save on blur, discard with Escape, free instruction from the toolbar over selected text. */
import { expect, test } from '@playwright/test';
import { expectProse, selectProse } from './prose';

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
  // The suggestion is shown as a change over the text; the text itself is unchanged until accepted.
  const inserted = description.locator('.cm-ai-ins');
  await expect(inserted).toHaveText('KI-Vorschlag 1');
  await expect(description.locator('.cm-ai-del')).toHaveText('Mira geht.');
  await expectProse(description, 'Mira geht.');

  await page.getByRole('button', { name: 'Nächster Vorschlag' }).click();
  await expect(inserted).toHaveText('KI-Vorschlag 2');

  // Tab accepts: the text is written and the bar closes.
  await page.keyboard.press('Tab');
  await expectProse(description, 'KI-Vorschlag 2');
  await expect(page.getByRole('button', { name: 'Nächster Vorschlag' })).toBeHidden();

  // Leaving the field saves it (wait for the PATCH so the reload cannot abort it).
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok());
  await panel.getByLabel('Titel', { exact: true }).click();
  await saved;
  await page.reload();
  await page.getByRole('button', { name: 'Storyline „Flucht“' }).click();
  await expectProse(panel.getByLabel('Kurzbeschreibung', { exact: true }), 'KI-Vorschlag 2');

  // Selection: only the selected part is changed, and Escape discards the suggestion.
  const reopened = panel.getByLabel('Kurzbeschreibung', { exact: true });
  await selectProse(reopened, 3, 'KI-Vorschlag 2'.length);
  await panel.getByRole('button', { name: 'KI-Assistent: Kurzbeschreibung', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stil verbessern' }).click();
  await expect(page.getByRole('button', { name: 'Vorschlag verwerfen' })).toBeVisible();
  // „Vorschlag 2“ → „KI-Vorschlag 1“: only the differing words are marked.
  await expect(reopened.locator('.cm-ai-del')).toHaveText('2');
  await expect(reopened.locator('.cm-ai-ins')).toHaveText(['KI-', '1']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Vorschlag verwerfen' })).toBeHidden();
  await expectProse(reopened, 'KI-Vorschlag 2');

  // Toolbar over selected text: a free instruction for the selection.
  await selectProse(reopened, 0, 'KI-Vorschlag'.length);
  const tools = page.getByRole('toolbar', { name: 'KI für die Markierung' });
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: 'Anweisung …' }).click();
  await page.getByRole('button', { name: 'kürzer' }).click();
  // „KI-Vorschlag“ → „KI-Vorschlag 1 (kürzer)“: only the addition is marked.
  await expect(reopened.locator('.cm-ai-ins')).toContainText('1 (kürzer)');
  await expect(reopened.locator('.cm-ai-del')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expectProse(reopened, 'KI-Vorschlag 1 (kürzer) 2');
});
