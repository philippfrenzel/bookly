/**
 * End-to-end flow: one scene assignment is written in ordered blocks. The text is split before „Jon antwortete“,
 * an empty block is inserted, only that block is drafted by the fake AI, and after a reload the order and the
 * neighbour texts are exact. The same scene on a side strand starts from that text, split into blocks at the
 * paragraph breaks, and keeps its own independent block list.
 */
import { expect, test } from '@playwright/test';

const FIRST = 'Mara fragte: „Wohin gehst du?“ ';
const LAST = 'Jon antwortete: „Zum Hafen.“';

test('scene writing in ordered blocks', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `scene-writing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Hafenbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Hafenbuch' }).click();

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

  // Character Jon.
  await page.getByRole('tab', { name: 'Figuren' }).click();
  await page.getByRole('button', { name: 'Figur', exact: true }).click();
  const figure = page.getByLabel('Name Figur Neue Figur', { exact: true });
  await figure.fill('Jon');
  await figure.blur();
  await expect(page.getByLabel('Name Figur Jon', { exact: true })).toBeVisible();

  // Scene „Hafen“.
  await page.getByRole('tab', { name: 'Szenen' }).click();
  await page.getByRole('button', { name: 'Szene', exact: true }).click();
  const sceneName = page.getByLabel('Name Szene Neue Szene', { exact: true });
  await sceneName.fill('Hafen');
  await sceneName.blur();
  await expect(page.getByLabel('Name Szene Hafen', { exact: true })).toBeVisible();

  // Main storyline with one section, Jon linked.
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });
  await panel.getByLabel('Titel', { exact: true }).fill('Reise');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 2' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('button', { name: 'Storyline „Reise“' }).click();
  await panel.getByRole('tab', { name: 'Figuren' }).click();
  const linked = panel.getByRole('group', { name: 'Figuren' }).getByRole('checkbox', { name: 'Jon' });
  await linked.click();
  await expect(linked).toBeChecked();
  await panel.getByRole('tab', { name: 'Zeitpunkte' }).click();
  await panel.getByRole('button', { name: 'Neuer Abschnitt' }).click();
  await panel.getByLabel('Titel neuer Abschnitt', { exact: true }).fill('Abfahrt');
  await panel.getByLabel('Zeitraum neuer Abschnitt Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum neuer Abschnitt Ende').selectOption({ label: 'Tag 1' });
  await panel.getByRole('button', { name: 'Abschnitt hinzufügen' }).click();

  // Side strand.
  await page.getByRole('button', { name: 'Zurück zum Buch' }).click();
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  await panel.getByLabel('Titel', { exact: true }).fill('Erinnerung');
  await panel.getByLabel('Nebenstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 1' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('button', { name: 'Zurück zum Buch' }).click();

  // Assign the scene to the section with a two-sentence description.
  await page.getByRole('button', { name: 'Storyline „Reise“' }).click();
  await panel.getByRole('tab', { name: 'Zeitpunkte' }).click();
  await panel.getByRole('button', { name: 'Abschnitt „Abfahrt“ bearbeiten' }).click();
  const scenes = panel.getByRole('group', { name: 'Szenen' });
  await scenes.getByLabel('Szene zuordnen').selectOption({ label: 'Hafen' });
  await scenes.getByLabel('Beschreibung der neuen Zuordnung').fill(FIRST + LAST);
  await scenes.getByRole('button', { name: 'Zuordnen' }).click();

  const block = (n: number) => scenes.getByLabel(`Block ${n} Szene Hafen`, { exact: true });
  await expect(block(1)).toHaveValue(FIRST + LAST);
  await expect(block(2)).toHaveCount(0);

  // Split exactly before „Jon antwortete“.
  await block(1).evaluate((el: HTMLTextAreaElement, i) => {
    el.focus();
    el.setSelectionRange(i, i);
  }, FIRST.length);
  // A key release reports the caret to the component without moving it.
  await page.keyboard.press('Shift');
  await scenes.getByRole('button', { name: 'Hier teilen' }).click();
  await expect(block(2)).toHaveValue(LAST);
  await expect(block(1)).toHaveValue(FIRST);

  // Insert an empty block after block 1; it becomes block 2 and takes focus.
  await block(1).focus();
  await scenes.getByRole('button', { name: 'Block einfügen' }).click();
  await expect(block(3)).toHaveValue(LAST);
  await expect(block(2)).toHaveValue('');
  await expect(block(2)).toBeFocused();

  // Draft only the empty block.
  await scenes.getByRole('button', { name: 'KI-Assistent: Block 2 Szene Hafen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vorschlagen' }).click();
  await expect(block(2)).toHaveValue('KI-Vorschlag 1');
  await expect(block(1)).toHaveValue(FIRST);
  await expect(block(3)).toHaveValue(LAST);

  // Leave the drafted block so the suggestion is kept and saved (wait for the request so the reload cannot abort it).
  const saved = page.waitForResponse((r) => r.request().method() !== 'GET' && r.url().includes('/api/') && r.ok());
  await block(1).click();
  await saved;
  await page.reload();
  await page.getByRole('button', { name: 'Storyline „Reise“' }).click();
  await panel.getByRole('tab', { name: 'Zeitpunkte' }).click();
  await panel.getByRole('button', { name: 'Abschnitt „Abfahrt“ bearbeiten' }).click();
  await expect(block(1)).toHaveValue(FIRST);
  await expect(block(2)).toHaveValue('KI-Vorschlag 1');
  await expect(block(3)).toHaveValue(LAST);
  await expect(scenes.getByLabel(/^Block \d+ Szene Hafen$/)).toHaveCount(3);
  await panel.getByRole('button', { name: 'Fertig' }).click();

  // The same scene on the side strand has its own, independent block list.
  await page.getByRole('button', { name: 'Zurück zum Buch' }).click();
  await page.getByRole('tab', { name: 'Szenen' }).click();
  await page.getByLabel('Szene Hafen zuordnen').selectOption({ label: 'Erinnerung' });
  await page.getByRole('button', { name: 'Storyline „Erinnerung“ öffnen' }).click();
  await expect(panel.getByRole('tab', { name: 'Szenen' })).toHaveAttribute('aria-selected', 'true');
  const side = panel.getByRole('group', { name: 'Szenen' });
  const sideBlock = side.getByLabel('Block 1 Szene Hafen', { exact: true });
  // It starts from the latest description, split into blocks at the paragraph breaks.
  await expect(side.getByLabel(/^Block \d+ Szene Hafen$/)).toHaveCount(3);
  for (const [i, text] of [FIRST, 'KI-Vorschlag 1', LAST].entries()) {
    await expect(side.getByLabel(`Block ${i + 1} Szene Hafen`, { exact: true })).toHaveValue(text);
  }
  await sideBlock.fill('Nur am Nebenstrang.');
  await sideBlock.blur();
  await expect(side.getByRole('button', { name: 'Hier teilen' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Storyline „Erinnerung“' }).click();
  await panel.getByRole('tab', { name: 'Szenen' }).click();
  await expect(panel.getByRole('group', { name: 'Szenen' }).getByLabel('Block 1 Szene Hafen', { exact: true })).toHaveValue('Nur am Nebenstrang.');

  // The main section is untouched.
  await page.getByRole('button', { name: 'Zurück zum Buch' }).click();
  await page.getByRole('button', { name: 'Storyline „Reise“' }).click();
  await panel.getByRole('tab', { name: 'Zeitpunkte' }).click();
  await panel.getByRole('button', { name: 'Abschnitt „Abfahrt“ bearbeiten' }).click();
  await expect(block(1)).toHaveValue(FIRST);
  await expect(block(2)).toHaveValue('KI-Vorschlag 1');
  await expect(block(3)).toHaveValue(LAST);
});
