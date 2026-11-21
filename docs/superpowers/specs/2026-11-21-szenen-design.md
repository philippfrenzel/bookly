# Design: Szenen verwalten

Stand: 2026-11-21 · Grundlage: RefinIQ-Übergabepaket „Szenen verwalten“ (Spezifikation Version 3, Review Record `SRR-2026-000009`, Status READY; FR-001–FR-006, AC-001–AC-008, EC-001–EC-003, DR-001, A-001, DEP-001, HDR-001, Q-001, Q-002). Baut auf `2026-11-20-storylines-design.md` und `2026-11-20-ki-textfelder-design.md` auf.

## 1. Absicht und Warum

Autorinnen und Autoren wollen die Handlung besser an Orte binden („Besserer Bezug von Handlung zu Ort“) und beim Lesen mehr Atmosphäre erzeugen. Dafür gibt es **Szenen**: ein Ort oder Schauplatz mit optional einem Bild und beliebig vielen Textnotizen. Eine Szene wird einem oder mehreren **Abschnitten** einer Storyline zugeordnet; jede Zuordnung trägt eine kurze **Szenenbeschreibung**, die die KI auf Klick aus Bild und Notizen vorschlagen kann.

**Verhältnis zu den Produktprinzipien (`packages/web/PRODUCT.md`).** „The author decides“: Die KI erzeugt nur auf ausdrücklichen Klick, der Vorschlag steht editierbar im Feld, gespeichert wird erst durch „Zuordnen“ bzw. das Verlassen des Feldes. „Structure, not prose“: Die Szenenbeschreibung ist eine kurze Strukturangabe zum Schauplatz (Limit 2000 Zeichen wie alle Beschreibungen), kein Romantext.

## 2. Ziele und Nicht-Ziele

**Ziele**
- Szenen anlegen, umbenennen und löschen (FR-001, AC-001).
- Pro Szene optional ein Bild und beliebig viele Textnotizen hinzufügen, ändern und entfernen (FR-002, DR-001, AC-002).
- Szenen einem oder mehreren Abschnitten zuordnen, Zuordnungen ändern und entfernen (FR-003, AC-003).
- KI-Beschreibung aus Bild und Notizen der Szene, nachvollziehbar protokolliert (FR-004, AC-004, AC-008, EC-001–EC-003).
- Beim Zuordnen wird die zuletzt gespeicherte Beschreibung eingefügt; bei mehreren bisherigen Beschreibungen wählt der Autor aus der Liste (FR-005, AC-005).
- Pro Zuordnung entscheidet der Autor, ob eine neue Beschreibung generiert wird (FR-006, AC-006).

**Nicht-Ziele** (Out of Scope laut Paket): Töne, Filme. Außerdem: mehrere Bilder pro Szene, Bildbearbeitung, Szenen auf der Karte, Zauberstab in Szenenfeldern.

## 3. Entscheidungen zu den offenen Punkten

Die folgenden Annahmen hat der Builder getroffen und dem Auftraggeber im Projekt-Thread genannt; sie sind leicht änderbar.

| Punkt | Entscheidung |
|---|---|
| **HDR-001** Erste Zuordnung, noch keine Beschreibung | Das Beschreibungsfeld bleibt leer. Hat die Szene Bild oder Notizen und ist die KI eingerichtet, steht „Beschreibung erzeugen“ bereit; sonst schreibt der Autor selbst (EC-003). Keine automatische KI-Anfrage. |
| **Q-001** Limits | Genau ein Bild pro Szene (laut FR-002), JPEG, PNG oder WebP, höchstens 5 MB. Notizen: keine Obergrenze der Anzahl (Prinzip „No ceiling“), je Notiz höchstens 10 000 Zeichen. Szenenname 200, Beschreibung 2000 Zeichen. An die KI gehen höchstens 20 000 Zeichen Notizen in ihrer Reihenfolge; was darüber hinausgeht, wird weggelassen und im Protokoll gezählt. |
| **Q-002** Neue Beschreibung ohne ausdrückliche Wahl | Nie. Ohne Wahl wird die zuletzt gespeicherte Beschreibung übernommen (FR-005). Generiert wird nur auf Klick. |
| Bildspeicher | In PostgreSQL (`bytea`), damit kein zusätzlicher Dateispeicher nötig ist. Das Bild ist nicht Teil der Buch-Antwort; es wird über eine eigene URL geladen. |

## 4. Fachliches Verhalten

### 4.1 Szenen (Reiter „Szenen“)

- Neuer Reiter „Szenen“ in der Seitenleiste neben Zeitpunkte, Figuren, Storyline.
- „+ Szene“ legt „Neue Szene“ an. Name wird beim Verlassen gespeichert (leer nicht erlaubt; fällt auf den gespeicherten Namen zurück).
- Bild: Vorschau, „Bild wählen“ / „Bild ersetzen“, „Bild entfernen“. Ungültiger Typ oder zu groß: Meldung, nichts gespeichert.
- Notizen: Liste von Textfeldern, gespeichert beim Verlassen; „+ Notiz“, Notiz löschen. Eine leer verlassene neue Notiz bleibt leer gespeichert (zählt nicht als Kontext).
- Anzeige „Zugeordnet zu: …“ (Abschnittstitel).
- Löschen mit Bestätigung; entfernt auch alle Zuordnungen.

### 4.2 Zuordnung im Abschnitt

Im Bearbeiten-Formular eines gespeicherten Abschnitts erscheint der Block „Szenen“:

- Je Zuordnung: Szenenname, Beschreibung (Textfeld, gespeichert beim Verlassen), „Neu erzeugen“ (KI, ersetzt den Feldinhalt sichtbar; gespeichert beim Verlassen bzw. sofort nach dem Einsetzen), „Entfernen“.
- „Szene zuordnen“: Auswahl der Szene (nur Szenen, die diesem Abschnitt noch nicht zugeordnet sind), dann:
  - **Bisherige Beschreibungen** der Szene (aus allen Zuordnungen, verschieden, neueste zuerst). Keine → Feld leer (HDR-001). Genau eine → wird eingefügt (FR-005). Mehrere → Auswahlliste, die neueste vorausgewählt (FR-005, AC-005).
  - „Beschreibung erzeugen“ (FR-006): Die KI erzeugt aus Bild und Notizen eine neue Beschreibung und setzt sie ins Feld. Deaktiviert mit Hinweis, wenn die Szene weder Bild noch Notizen hat (EC-003) oder die KI nicht eingerichtet ist.
  - Beschreibung im Feld frei bearbeitbar; „Zuordnen“ speichert.
- Eine Szene kann demselben Abschnitt nur einmal zugeordnet sein.
- Erweiterung (2026-11-21, Wunsch des Auftraggebers):
  - **Frühere Beschreibung einsetzen** auch bei bestehenden Zuordnungen: Auswahlliste mit den Beschreibungen der anderen Zuordnungen dieser Szene (neueste zuerst, ohne die eigene). Die Wahl steht als Vorschlag im Feld und wird erst mit „Übernehmen“ gespeichert, „Verwerfen“ stellt den alten Text her.
  - **Verschieben nach …**: Eine Zuordnung samt Beschreibung zieht in einen anderen Abschnitt (gruppiert nach Storyline; nur Abschnitte, denen die Szene noch nicht zugeordnet ist). Server: `PATCH …/scene-assignments/:id` mit `sectionId`, 409 `already_assigned`, wenn die Szene dort schon liegt. Ein reines Verschieben ändert `updatedAt` nicht, weil es das Alter der Beschreibung angibt.
  - **Szenen für ganze Storylines** (Rückmeldung beim Testen: ein Nebenstrang wie „Erinnerung“ hat keine Abschnitte, also war dort keine Zuordnung möglich): Eine Zuordnung zeigt jetzt entweder auf einen Abschnitt oder auf eine ganze Storyline (`scene_assignments.storyline_id`, Migration `0004`, Prüfregel „genau eins von beiden“). Jede Storyline hat einen Reiter „Szenen“ mit denselben Möglichkeiten wie im Abschnitt; beim Hauptstrang zeigt er zusätzlich, welche Szenen in welchen Abschnitten liegen, und verweist auf „Zeitpunkte“.
  - **Zuordnen direkt an der Szene**: „Zuordnen zu …“ auf der Szenenkarte bietet alle Storylines und Abschnitte an, in denen die Szene noch nicht liegt. Die neue Zuordnung startet mit der zuletzt gespeicherten Beschreibung (FR-005); eine andere frühere wählt man danach am Ziel über „Frühere Beschreibung einsetzen“. Die Chips „Zugeordnet zu“ öffnen auch Storylines (Reiter „Szenen“).
  - **Beispielbeschreibung** auf der Szenenkarte: Die KI schreibt aus Bild und Notizen einen kurzen erzählenden Absatz (80–150 Wörter), damit man ein Gefühl bekommt, wie der Ort im Buch klingen könnte. Nur Vorschau, wird nicht gespeichert. Server: `POST …/scenes/:id/description` mit `kind: "sample"`; das Protokoll nennt `kind`.

### 4.3 KI-Beschreibung (FR-004)

- Kontext: Szenenname, alle nichtleeren Notizen, das Bild (falls vorhanden) als Bild-Eingabe, dazu Titel und Kurzbeschreibung des Abschnitts und Titel der Storyline (wenn ein Abschnitt angegeben ist).
- Nur Notizen → nur Notizen (EC-001); nur Bild → nur Bild (EC-002); weder noch → 400 `empty_context`, im Browser vorab deaktiviert (EC-003).
- Vorgaben: Deutsch, 2–5 Sätze, Ort und Atmosphäre beschreiben, nichts erfinden, was Bild oder Notizen widerspricht, keine Handlung ausschreiben.
- Ausgabe: genau eine Beschreibung (strukturierte JSON-Antwort `{ description }`), getrimmt, auf 2000 Zeichen gekürzt.
- **Nachvollziehbarkeit (AC-004, AC-008):** Jeder Aufruf schreibt eine Log-Zeile `scene description context` mit Szene, Abschnitt, Anzahl Notizen, übergebenen Notiz-Zeichen, ob ein Bild übergeben wurde (Typ, Größe) und Modell. Inhalte werden nicht geloggt.
- Fehler: 502 `ai_failed`, Meldung „Beschreibung fehlgeschlagen.“; KI aus: 503 `ai_disabled`, Knopf deaktiviert.

## 5. Technischer Entwurf

### 5.1 Datenbank (Migration `0003_scenes`)

- `scenes (id, book_id → books cascade, name, created_at)`
- `scene_images (scene_id PK → scenes cascade, mime, data bytea, size, updated_at)`
- `scene_notes (id, scene_id → scenes cascade, text, position, created_at)`
- `scene_assignments (id, scene_id → scenes cascade, section_id → sections cascade, description, updated_at, unique(scene_id, section_id))`

### 5.2 Shared

- Typen `Scene { id; name; image: { mime; size; version } | null; notes: SceneNote[] }`, `SceneNote { id; text }`, `SceneAssignment { id; sceneId; sectionId; description; updatedAt }`.
- `BookResponse` bekommt `scenes: Scene[]` und `sceneAssignments: SceneAssignment[]`; das `Book`-Aggregat (Hinweise, Validierung) bleibt unverändert.
- Zod: `SceneBody`, `SceneNoteBody`, `SceneAssignmentCreateBody`, `SceneAssignmentPatchBody`, `SceneDescriptionBody`. Konstanten `SCENE_IMAGE_TYPES`, `SCENE_IMAGE_MAX_BYTES`.
- Reine Regel `previousDescriptions(sceneId, assignments)` (verschieden, nichtleer, neueste zuerst).

### 5.3 Server

- `books/scenes.ts`: CRUD Szenen, Notizen, Bild (`PUT …/scenes/:id/image` mit rohem Bildinhalt, Magic-Bytes-Prüfung; `GET` liefert das Bild mit `Cache-Control: private`; `DELETE`), Zuordnungen (`POST/PATCH/DELETE …/scene-assignments`). Alle über `requireUser` + `bookGuard` und `app.mutate`, damit `updatedAt` des Buchs mitläuft.
- `ai/scenePrompt.ts`: baut Anfrage und parst die Antwort. `AiRequest` bekommt optional `images`; der OpenRouter-Client schickt dann den Nutzerinhalt als Teile (`text` + `image_url` mit data-URL).
- Route `POST …/scenes/:sceneId/description` (`requireAi`), Fake-Client liefert eine deterministische Beschreibung.

### 5.4 Web

- `scene/ScenePanel.tsx` (Reiter), `scene/SceneAssignments.tsx` (Block im Abschnitt), `scene/useSceneDescription.ts`.
- Upload über `fetch` mit dem Bild als Body.

## 6. Akzeptanzkriterien (Abbildung)

| AC | Abdeckung |
|---|---|
| AC-001 | 4.1, Server- und Komponententests Szenen-CRUD |
| AC-002 | 4.1, Tests Bild/Notizen |
| AC-003 | 4.2, Tests Zuordnung anlegen/ändern/entfernen |
| AC-004 / AC-008 | 4.3, Test: Bild und Notizen erreichen den KI-Client, Log-Zeile |
| AC-005 | 4.2, Test `previousDescriptions` und Komponententest Auswahl |
| AC-006 | 4.2, Komponententest „Beschreibung erzeugen“ |

Siehe auch: [Szenen schreiben](2026-11-21-szenen-schreiben-design.md) (Blöcke je Zuordnung, KI je Block, Buchumfang).
