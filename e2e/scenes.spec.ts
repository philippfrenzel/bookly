/**
 * End-to-end flow: scene with image and note, assigned to a section, fake-AI description, second assignment
 * reuses it, an earlier description is put back into an existing assignment and the assignment is moved.
 */
import { expect, test } from '@playwright/test';

/** A 1×1 PNG, uploaded as the scene image. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwmHAAAAKkAZGL4t77AAAAAElFTkSuQmCC', 'base64');

test('scene management and assignment flow', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const email = `scenes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Anzeigename').fill('Test Autorin');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('geheim-1234');
  await page.getByRole('button', { name: 'Registrieren' }).click();

  await page.getByRole('button', { name: 'Neues Buch' }).click();
  await page.getByLabel('Titel').fill('Szenenbuch');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: 'Szenenbuch' }).click();

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

  // Scene with an image and a note (AC-001, AC-002).
  await page.getByRole('tab', { name: 'Szenen' }).click();
  await page.getByRole('button', { name: 'Szene', exact: true }).click();
  const sceneName = page.getByLabel('Name Szene Neue Szene', { exact: true });
  await sceneName.fill('Bergsee');
  await sceneName.blur();
  await expect(page.getByLabel('Name Szene Bergsee', { exact: true })).toBeVisible();
  await page.getByLabel('Bild für Szene Bergsee wählen').setInputFiles({ name: 'see.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: 'Bild der Szene Bergsee' })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: 'Bild der Szene Bergsee' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Notiz zur Szene „Bergsee“ hinzufügen' }).click();
  const note = page.getByLabel('Notiz 1 Szene Bergsee');
  await note.fill('Klarer See in den Alpen, leichter Nebel, wo die Morgensonne auftrifft.');
  await note.blur();

  // Main storyline with two sections.
  await page.getByRole('button', { name: 'Neue Storyline' }).click();
  const panel = page.getByRole('region', { name: 'Storyline bearbeiten' });
  await panel.getByLabel('Titel', { exact: true }).fill('Reise');
  await panel.getByLabel('Hauptstrang').check();
  await panel.getByLabel('Zeitraum Start').selectOption({ label: 'Tag 1' });
  await panel.getByLabel('Zeitraum Ende').selectOption({ label: 'Tag 2' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('button', { name: 'Storyline „Reise“' }).click();
  await panel.getByRole('tab', { name: 'Zeitpunkte' }).click();
  for (const [title, tp] of [['Ankunft', 'Tag 1'], ['Abschied', 'Tag 2'], ['Rückkehr', 'Tag 2']] as const) {
    await panel.getByRole('button', { name: 'Neuer Abschnitt' }).click();
    await panel.getByLabel('Titel neuer Abschnitt', { exact: true }).fill(title);
    await panel.getByLabel('Zeitraum neuer Abschnitt Start').selectOption({ label: tp });
    await panel.getByLabel('Zeitraum neuer Abschnitt Ende').selectOption({ label: tp });
    await panel.getByRole('button', { name: 'Abschnitt hinzufügen' }).click();
    await expect(panel.getByRole('button', { name: `Abschnitt „${title}“ bearbeiten` })).toBeVisible();
  }

  // First assignment: empty, fake AI fills it from image and note (HDR-001, FR-004, FR-006).
  await panel.getByRole('button', { name: 'Abschnitt „Ankunft“ bearbeiten' }).click();
  const scenes = panel.getByRole('group', { name: 'Szenen' });
  await scenes.getByLabel('Szene zuordnen').selectOption({ label: 'Bergsee' });
  const text = scenes.getByLabel('Beschreibung der neuen Zuordnung');
  await expect(text).toHaveValue('');
  await scenes.getByRole('button', { name: 'Beschreibung erzeugen' }).click();
  await expect(text).toHaveValue('KI-Szenenbeschreibung (1 Notizen, mit Bild)');
  await text.fill('Nebel über dem Bergsee.');
  await scenes.getByRole('button', { name: 'Zuordnen' }).click();
  await expect(scenes.getByLabel('Beschreibung Szene Bergsee')).toHaveValue('Nebel über dem Bergsee.');
  await panel.getByRole('button', { name: 'Fertig' }).click();

  // Second assignment starts with the last stored description (FR-005).
  await panel.getByRole('button', { name: 'Abschnitt „Abschied“ bearbeiten' }).click();
  await scenes.getByLabel('Szene zuordnen').selectOption({ label: 'Bergsee' });
  await expect(scenes.getByLabel('Beschreibung der neuen Zuordnung')).toHaveValue('Nebel über dem Bergsee.');
  await scenes.getByRole('button', { name: 'Zuordnen' }).click();
  await expect(scenes.getByLabel('Beschreibung Szene Bergsee')).toBeVisible();

  await panel.getByRole('button', { name: 'Fertig' }).click();

  // The timetable below the map names the scene on both section cards.
  const timetable = page.getByRole('region', { name: 'Fahrplan der Storyline' });
  await expect(timetable.getByText('Bergsee')).toHaveCount(2);

  // Back in the book, the scene lists its sections; a click opens the section in its storyline.
  await page.getByRole('button', { name: 'Zurück zum Buch' }).click();
  await page.getByRole('tab', { name: 'Szenen' }).click();
  const usage = page.getByRole('region', { name: 'Szenen' });
  await expect(usage.getByRole('button', { name: 'Abschnitt „Ankunft“ öffnen' })).toBeVisible();
  await usage.getByRole('button', { name: 'Abschnitt „Abschied“ öffnen' }).click();
  await expect(panel.getByRole('tab', { name: 'Zeitpunkte' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('group', { name: 'Szenen' }).getByLabel('Beschreibung Szene Bergsee')).toBeVisible();

  // Existing assignment: change it, then take the earlier description back from the list (FR-005).
  const sceneBlock = panel.getByRole('group', { name: 'Szenen' });
  const own = sceneBlock.getByLabel('Beschreibung Szene Bergsee');
  await own.fill('Sonne über dem See.');
  await own.blur();
  await sceneBlock.getByLabel('Frühere Beschreibung für Szene Bergsee einsetzen').selectOption({ label: 'Nebel über dem Bergsee.' });
  await expect(own).toHaveValue('Nebel über dem Bergsee.');
  await sceneBlock.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(sceneBlock.getByRole('button', { name: 'Übernehmen' })).toHaveCount(0);

  // Move the assignment to another section (AC-003); its description goes along.
  await sceneBlock.getByLabel('Szene Bergsee in anderen Abschnitt verschieben').selectOption({ label: 'Rückkehr' });
  await expect(sceneBlock.getByLabel('Beschreibung Szene Bergsee')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Fertig' }).click();
  await panel.getByRole('button', { name: 'Abschnitt „Rückkehr“ bearbeiten' }).click();
  await expect(panel.getByRole('group', { name: 'Szenen' }).getByLabel('Beschreibung Szene Bergsee')).toHaveValue('Nebel über dem Bergsee.');
});
