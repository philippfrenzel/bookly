# Design: KI-Zauberstab für alle Textfelder

Stand: 2026-11-20 · Grundlage: Anforderungsdokument „KI-Unterstützung für alle Texte und Beschreibungen“ (FR-001–FR-008, NFR-001/002, BR-001, DR-001, AC-001–AC-009, EC-001–EC-003, Q-001–Q-006), ergänzt durch die Klärung mit dem Auftraggeber. Baut auf `2026-11-20-storylines-design.md` und `2026-11-20-character-profiles-design.md` auf.

## 1. Absicht und Warum

Autorinnen und Autoren sollen schneller zu guten Strukturtexten kommen (Beschreibungen, Notizen, Titel, Figurenprofile), Schreibblockaden überwinden und ihre Texte stilistisch und inhaltlich konsistent halten. Dafür bekommt jedes Textfeld einen **Zauberstab**: ein kleines Menü mit Aktionen, das 3 Vorschläge liefert. Der erste wird sofort an Ort und Stelle eingesetzt, die anderen sind per Pfeil erreichbar, alles ist rückgängig machbar. Vorbild sind Editoren wie SUNO (Generieren aus dem Kontext und gezieltes Überarbeiten markierter Passagen).

Geschäftsziel: schnellere Fertigstellung von Texten, häufigere Nutzung des Zauberstabs.

**Verhältnis zu den Produktprinzipien (`packages/web/PRODUCT.md`).** „The author decides“ bleibt gewahrt: Die KI handelt nur auf ausdrücklichen Klick, jeder Vorschlag ist sichtbar, wechselbar und rückgängig zu machen, gespeichert wird erst durch das normale Verlassen des Feldes. „Structure, not prose“ bleibt gewahrt: Der Zauberstab arbeitet nur in den bestehenden Strukturfeldern; es entsteht kein neues Feld für Romantext.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Zauberstab an allen inhaltlichen Textfeldern (FR-001, A-001; Liste in Abschnitt 6.1).
- Markierung steuert den Umfang: mit Markierung nur diese Passage, ohne Markierung das ganze Feld (FR-002, FR-006, AC-001, AC-002, AC-006, EC-001).
- Aktionsmenü: Umformulieren, Fortsetzen, Stil verbessern; bei leerem Feld „Vorschlagen“ (FR-003).
- 3 Vorschläge pro Anfrage, erster sofort eingesetzt, ◀ ▶ zum Wechseln (FR-004, AC-003, AC-004, Q-003).
- Undo stellt den vorherigen Text her; Escape / ✕ / Klick außerhalb verlässt die Vorschlagsansicht (FR-005, BR-001, AC-005, AC-009, EC-003).
- Kontext B: Feld plus sein direktes fachliches Umfeld (FR-003, Q-004; Abschnitt 6.3).
- Ein gemeinsamer Endpunkt und eine gemeinsame Feld-Komponente für alle Felder.
- Die bisherige Figuren-Vorschlagsbox („Vorschlagen“ / `SuggestionBox`) wird durch den Zauberstab ersetzt.

**Nicht-Ziele**
- Bilder oder andere Medien.
- Eine freie Anweisung („spannender“, „aus Miras Sicht“). Kann später als vierter Menüpunkt kommen.
- Kontext aus dem ganzen Buch (Variante C, verworfen).
- Persistenz von Vorschlagsverlauf oder KI-Einstellungen (DR-001, Q-006: nichts wird gespeichert).
- KI in Login, Registrierung, Buchtitel, Zeitpunkt-Namen.
- Streaming der Antwort.

**Anti-Ziele**
- Die KI ändert Text, ohne dass der Nutzer es angestoßen hat, oder speichert eigenmächtig.
- Nach einem Vorschlag lässt sich der vorherige Text nicht mehr herstellen.
- Feldlimits werden durch Vorschläge überschritten und das Speichern scheitert.
- Jedes Feld verhält sich ein bisschen anders.
- Die App funktioniert ohne KI-Schlüssel nicht mehr.

## 3. Rahmenbedingungen

- Stack: React/Vite (`packages/web`), Fastify + Drizzle/PostgreSQL (`packages/server`), Zod-Schemas und Typen in `packages/shared`. Oberfläche Deutsch.
- KI über den bestehenden OpenRouter-Client (`server/src/ai/client.ts`, strukturierte JSON-Antworten). Ohne Schlüssel: `ai.enabled = false`, Zauberstab deaktiviert mit Titel „KI nicht eingerichtet“; Endpunkt antwortet 503 `ai_disabled` (bestehendes `requireAi`).
- Fake-Client (`ai/fake.ts`, `AI_FAKE=1`) bekommt deterministische Antworten für die neue Anfrage, damit E2E-Tests laufen.
- Feldlimits: Titel 200, Beschreibungen und Figurenfelder 2000, Notizen 10000, Verbindungs-Label 200 Zeichen.
- Texte der Felder und ihres Umfelds gehen an OpenRouter bzw. den Modellanbieter; mit dem Konfigurieren des Schlüssels in Kauf genommen (wie bei den Figuren).

## 4. Approaches (betrachtete Umsetzungswege)

| | Aufbau | Vorteil | Nachteil |
|---|---|---|---|
| **1 (gewählt)** | Eine gemeinsame Zauberstab-Erweiterung für Textfelder im Web, ein gemeinsamer Endpunkt `POST /api/books/:bookId/ai/text`, Kontext serverseitig aus dem Buch | Überall gleiches Verhalten; neues Feld kostet eine Zeile; Kontextregeln an einer Stelle testbar | Bestehende Figuren-Vorschläge werden umgebaut, ihr Verhalten ändert sich |
| 2 | Eigene Vorschlags-Endpunkte pro Bereich (wie heute bei Figuren) | Jeder Endpunkt einfach | Prompt, Validierung, Fehlerbehandlung vierfach; widerspricht „überall gleich“ |
| 3 | Rich-Text-Editor mit KI-Erweiterung (z. B. TipTap) | Markierung, Undo, Inline-Menüs fertig | Große Abhängigkeit, alle Felder umbauen, Felder sind reiner Text; überdimensioniert |

**Gewählt: 1**, vom Auftraggeber entschieden.

## 5. Vom Auftraggeber entschiedene Punkte

1. Kontext **Variante B**: Feld plus direktes Umfeld (nicht nur Feld, nicht ganzes Buch).
2. **Kleines Menü am Zauberstab** mit Umformulieren, Fortsetzen, Stil verbessern (statt eines Klicks mit fester Regel, statt Menü plus freier Anweisung).
3. Umsetzungsweg **1** (gemeinsame Komponente, gemeinsamer Endpunkt).
4. **Alle automatischen Figurenvorschläge entfallen** (Vorschlag beim Verlassen der Figurenbeschreibung und der `suggestTick`-Vorschlag für Ergänzungen nach Storyline-Änderungen). Das ersetzt die frühere Entscheidung zu Q-002 in `2026-11-20-character-profiles-design.md`. KI-Text entsteht nur noch auf Klick am Zauberstab; Verhalten und Absichten werden einzeln vorgeschlagen.
5. **Klick außerhalb behält** den eingesetzten Vorschlag; nur Escape / ✕ / ↶ verwerfen. Das präzisiert BR-001 (Verlassen ohne Übernahme = Escape oder ✕).
6. **Leeres Feld bietet „Vorschlagen“** aus dem Umfeld; ausgegraut mit Hinweis nur, wenn auch das Umfeld leer ist. Das ist die gewählte Auslegung von FR-007 / AC-007.

Folgende Punkte hat der Builder vorgeschlagen; der Auftraggeber hat ihnen nicht widersprochen (leicht später änderbar):
- Fest 3 Vorschläge.
- Kein Schalter „ganzer Text / Markierung“; die Markierung entscheidet.
- Markierung mindestens 3 Zeichen, Obergrenze = Feldlimit.
- Nichts wird gespeichert außer dem übernommenen Feldtext auf dem normalen Weg.
- Bisherige Figuren-`SuggestionBox` entfällt.

## 6. Fachliches Verhalten

### 6.1 Felder mit Zauberstab

| Bereich | Felder | Speichern heute |
|---|---|---|
| Storyline (`StorylinePanel`) | Titel, Beschreibung, Notiz | Bearbeiten: beim Verlassen; Anlegen: live in den Entwurf |
| Abschnitt (`SectionList`) | Titel, Beschreibung, Notiz | wie Storyline |
| Figur (`CharacterPanel`) | Name, Beschreibung, Verhalten, Absichten | beim Verlassen |
| Figuren-Ergänzung (`AdditionEditor`) | Verhalten, Absichten | beim Verlassen |
| Verbindung (`ConnectionDialog`) | Label (Freitext) | mit „Speichern“ im Dialog |

Kein Zauberstab: Login, Registrierung, Buchtitel, Zeitpunkt-Namen, Farb- und Auswahlfelder.

### 6.2 Ablauf

```
Beschreibung                                  🪄
┌──────────────────────────────────────────────┐
│ Mira flieht aus dem Dorf, [weil die Ernte    │
│ verdorben ist].           ◀ 1/3 ▶   ↶   ✕    │
└──────────────────────────────────────────────┘
          🪄 Menü:  Umformulieren · Fortsetzen · Stil verbessern
          (leeres Feld: nur „Vorschlagen“)
```

1. **Auslösen.** Klick auf 🪄 öffnet das Menü. Die Markierung im Feld wird beim Öffnen gemerkt (sie darf durch den Klick nicht verloren gehen). Tastatur: Zauberstab ist fokussierbar; Menü mit Pfeiltasten und Enter bedienbar.
2. **Umfang.**
   - Markierung vorhanden: Aktion bezieht sich nur auf die Markierung; der übrige Feldtext dient als Kontext.
   - Keine Markierung: Aktion bezieht sich auf den ganzen Feldtext.
   - „Fortsetzen“ ohne Markierung hängt an das Feldende an (der Vorschlag ist nur der neue Teil); mit Markierung wird hinter der Markierung eingefügt, die Markierung bleibt stehen. *(Vorschlag des Builders.)*
   - Leeres Feld: Menü zeigt nur „Vorschlagen“ (Text aus dem Umfeld erzeugen).
3. **Laden.** Während der Anfrage zeigt der Zauberstab einen Ladezustand, das Feld bleibt bedienbar, eine zweite Anfrage im selben Feld ist gesperrt. Tippt der Nutzer während des Ladens im Feld, wird die eintreffende Antwort verworfen (der Text, auf den sie sich bezog, existiert nicht mehr). *(Vorschlag des Builders.)*
4. **Einsetzen.** Vorschlag 1 ersetzt sofort den Zielbereich (Markierung bzw. ganzes Feld bzw. Einfügestelle bei „Fortsetzen“). Der eingesetzte Text wird markiert, damit sichtbar ist, was neu ist. Die Leiste `◀ 1/3 ▶ ↶ ✕` erscheint am Feld.
5. **Wechseln.** ◀ ▶ (bzw. Alt+← / Alt+→ im Feld, *Builder-Wahl*) ersetzen den eingesetzten Bereich durch den vorigen/nächsten Vorschlag.
6. **Rückgängig.** ↶ stellt den Feldtext von vor der Anfrage her und schließt die Leiste. Zusätzlich bleibt Strg/Cmd+Z des Browsers wirksam: Einsetzen und Wechseln laufen über die native Texteinfügung (z. B. `document.execCommand('insertText')` bzw. gleichwertig), damit der Undo-Verlauf des Feldes erhalten bleibt.
7. **Übernehmen / Verlassen.**
   - Weitertippen, Klick außerhalb oder Verlassen des Feldes: der aktuell sichtbare Vorschlag bleibt stehen, Leiste schließt. Gespeichert wird über den bestehenden Weg (beim Verlassen bzw. live im Entwurf bzw. „Speichern“ im Dialog).
   - ✕ oder Escape: wie ↶ — Ursprungstext wiederhergestellt, nichts übernommen (BR-001, AC-009, EC-003). Escape im `ConnectionDialog` schließt zuerst nur die Vorschlagsleiste, nicht den Dialog.
   - Klick außerhalb behält den Vorschlag (Entscheidung 5 in Abschnitt 5), damit ein versehentlicher Klick keine Arbeit verwirft und kein Wiederherstellen vor dem Speichern-beim-Verlassen nötig ist.
8. **Fehler.** KI nicht eingerichtet: Zauberstab deaktiviert. KI-Fehler oder Zeitüberschreitung: kurze Meldung am Feld („Vorschlag fehlgeschlagen.“), Feldtext unverändert. Weniger als 3 brauchbare Vorschläge: es werden so viele angezeigt, wie vorhanden; keiner: Meldung „Kein Vorschlag.“.

### 6.3 Kontext (Variante B)

Der Browser schickt, **welches Feld** gemeint ist, den **aktuellen Feldtext** (auch ungespeichert), die **Markierung** und die **ungespeicherten Werte der übrigen Felder desselben Objekts** (Entwurf, wie heute `SuggestionBody` bei Figuren). Den Rest liest der Server aus dem Buch; Entwurfswerte gewinnen über gespeicherte.

| Feld gehört zu | Kontext zusätzlich zum Feld |
|---|---|
| Storyline | Buchtitel; Titel, Beschreibung, Notiz, Art (Haupt/Neben), Status, Zeitraum (Zeitpunkt-Namen) der Storyline; Titel + Beschreibung ihrer Abschnitte; Name + Beschreibung ihrer Figuren |
| Abschnitt | wie Storyline (der übergeordneten), zusätzlich Titel, Beschreibung, Zeitraum des Abschnitts selbst sowie Titel + Beschreibung des Abschnitts davor und danach; Figuren des Abschnitts |
| Figur | Buchtitel; Name, Beschreibung, Verhalten, Absichten; Titel der Storylines, in denen die Figur vorkommt |
| Figuren-Ergänzung | Grundprofil der Figur, die Storyline (Titel, Beschreibung, Notiz, Abschnitte) und die andere Ergänzungsfeld-Eingabe; Hinweis an die KI, nur Abweichungen vom Grundprofil zu beschreiben (wie heutiger `ADDITION`-Prompt) |
| Verbindung | Typ der Verbindung; Titel + Beschreibung der beiden verbundenen Storylines (Verbindungen verbinden nur Storylines); ggf. Name der wechselnden Figur |

**Anlegen-Formulare** (neue Storyline / neuer Abschnitt / neue Verbindung) haben noch keine ID. Dann schickt der Browser den Entwurf mit dem übergeordneten Bezug (Buch bzw. Storyline bzw. von/zu-IDs), und der Server baut den Kontext aus Entwurf plus vorhandenen Bezügen.

**Leeres Umfeld:** Ist das Feld leer und liefert der Kontext keinen nichtleeren Text (z. B. neue Storyline ohne Titel), ist „Vorschlagen“ deaktiviert mit Hinweis „Erst Titel oder Beschreibung eingeben.“ (FR-007, AC-007). Das prüft der Browser vorab für die Felder desselben Objekts; der Server lehnt einen solchen Fall zusätzlich mit 400 `empty_context` ab.

### 6.4 Grenzen (FR-008, Q-005, EC-002)

- Markierung unter 3 Zeichen (nach Trimmen): Menüpunkte deaktiviert mit Hinweis „Markierung zu kurz.“ *(Vorschlag des Builders.)*
- Obergrenze: das Feldlimit; eine längere Markierung ist technisch nicht möglich.
- Vorschläge werden getrimmt und so gekürzt, dass **der gesamte Feldtext nach dem Einsetzen** das Feldlimit nicht überschreitet (nicht nur der Vorschlag allein). Bei Titel- und Labelfeldern zusätzlich: einzeilig (Zeilenumbrüche entfernt).
- Ist ein Feld so voll, dass „Fortsetzen“ keinen Platz mehr hat (weniger als 20 freie Zeichen, *Builder-Wahl*), ist „Fortsetzen“ deaktiviert.

### 6.5 Qualität und Antwortzeit (NFR-001, NFR-002, Q-001, Q-002)

- Prompt-Vorgaben: Deutsch; Tonalität, Zeitform, Perspektive und Vokabular des vorhandenen Textes übernehmen; keine Fakten erfinden, die dem Kontext widersprechen; Länge ähnlich dem Zielbereich (Umformulieren / Stil verbessern) bzw. 1–3 Sätze (Fortsetzen / Vorschlagen); Titel kurz (max. ~8 Wörter); 3 **deutlich unterschiedliche** Varianten; nur der Ersatztext, ohne Anführungszeichen, Erklärungen oder Wiederholung des Kontexts.
- Bewertung bleibt manuell durch den Nutzer (NFR-001); keine automatische Qualitätsmessung.

**Verbindliche Ergänzung für Spookly (NFR-001, 2026-11-21).** Generierte Textvorschläge müssen in jedem auswählbaren Stil natürlich und wie von einem Menschen formuliert klingen. Der gewählte Stil muss erkennbar bleiben. Die Vorschläge verwenden konkrete, zum Feld und seinem Kontext passende Formulierungen und variieren den Satzbau, soweit die Textlänge das zulässt. Sie vermeiden austauschbare Floskeln, unnötige Wiederholungen und schematische KI-Formulierungen.

- Die Vorgaben für die Textgenerierung berücksichtigen diese Qualitätsmerkmale für jeden angebotenen Stil. Formulierungen und Satzbau richten sich nach dem gewählten Stil und dem konkreten Kontext.
- Für die manuelle Abnahme werden für jeden auswählbaren Stil mehrere Beispielvorschläge anhand derselben repräsentativen Feldkontexte beurteilt. Bewertet werden Natürlichkeit, Erkennbarkeit des Stils, Kontextbezug, sprachliche Abwechslung sowie Floskeln, Wiederholungen und schematische Formulierungen. Jeder Stil muss die Kriterien eigenständig erfüllen.
- Zeitlimit der KI-Anfrage: 20 s *(Builder-Wahl; heute 30 s bei Figuren)*. Zielwert für typische Anfragen: unter 5 s (abhängig vom gewählten Modell, nicht garantiert).

## 7. Technischer Entwurf

### 7.1 Shared (`packages/shared`)

- Neues Schema `AiTextBody`:
  - `target`: diskriminierte Union über `kind` — `storyline` (`storylineId?`), `section` (`storylineId`, `sectionId?`), `character` (`characterId`), `addition` (`storylineId`, `characterId`), `connection` (`connectionId?`, `fromId`, `toId`, `type`, `characterId?`).
  - `field`: je `kind` erlaubte Feldnamen (z. B. `title | description | note`).
  - `action`: `rephrase | continue | polish | generate`.
  - `text`: aktueller Feldtext (max. Feldlimit).
  - `selection`: `{ start, end }` oder `null`.
  - `draft`: ungespeicherte Werte der übrigen Felder des Objekts (optional, je `kind`).
  - Validierung: `generate` nur bei leerem `text`; `rephrase`/`polish` brauchen nichtleeren Zielbereich (≥ 3 Zeichen bei Markierung); Markierung innerhalb von `text`.
- Ergebnis `AiTextResult`: `{ suggestions: string[] }` (1–3 Einträge).
- Konstanten für Feldlimits pro `kind`/`field`, gemeinsam von Web (Kürzen/Hinweise) und Server genutzt.
- Entfernt: `SuggestionBody`, `SuggestionResult`, `Suggestion` (sofern nicht anderweitig genutzt).

### 7.2 Server (`packages/server`)

- `ai/textContext.ts`: baut aus `Book` + `AiTextBody` den Kontext nach Abschnitt 6.3; prüft, dass alle IDs zum Buch gehören (`NotFoundError` sonst), und erkennt leeren Kontext.
- `ai/textPrompt.ts`: `textRequest(ctx, body)` → `AiRequest` mit Systemprompt je Aktion und Feldart, JSON-Schema `{ suggestions: string[] }` (genau 3 angefordert); `parseTextSuggestions(raw, limits)` → validiert, trimmt, entfernt Leere und Duplikate, kürzt nach 6.4.
- Route in `books/aiRoutes.ts`: `POST /api/books/:bookId/ai/text` mit `requireUser`, `bookGuard`, `requireAi`; 400 bei ungültigem Body / `empty_context`, 404 bei fremden IDs, 502 `ai_failed` bei KI-Fehlern (Logging wie heute).
- Entfernt: die beiden `/suggestion`-Routen der Figuren und `ai/suggestPrompt.ts` (Inhalte des `ADDITION`-Prompts wandern in `textPrompt.ts`).
- `ai/fake.ts`: für `schemaName === 'text_suggestions'` drei deterministische Varianten, z. B. `["Fake 1: …", "Fake 2: …", "Fake 3: …"]` abgeleitet aus Aktion und Zielbereich.
- Keine Datenbankänderung.

### 7.3 Web (`packages/web`)

- `ai/useAiText.ts`: Hook für eine Anfrage (Laden, Fehler, Abbruch bei Feldänderung).
- `ai/MagicWand.tsx` bzw. `ai/useMagicField.ts`: hängt sich an ein `<input>`/`<textarea>` (per Ref), rendert 🪄-Knopf, Menü und Vorschlagsleiste; verwaltet Ursprungstext, Zielbereich, Index, Einsetzen per nativer Texteinfügung, Escape/✕/↶, Schließen bei Tippen/Blur/Klick außerhalb. Löst nach dem Einsetzen ein `input`-Event aus, damit kontrollierte Komponenten (`TextInput` mit `live`) den neuen Wert übernehmen.
- Einbindung:
  - `storyline/fields.tsx` `TextInput` bekommt eine optionale Prop `ai?: { target, field, draft: () => Draft }`; damit sind Storyline- und Abschnittsfelder abgedeckt.
  - `CharacterPanel`, `AdditionEditor`, `ConnectionDialog` binden den Zauberstab an ihre eigenen Felder.
- Entfernt: `character/SuggestionBox.tsx`, `character/useSuggestion.ts`, der „Vorschlagen“-Knopf, der automatische Vorschlag beim Verlassen der Figurenbeschreibung sowie `suggestTick` und seine Weitergabe in `StorylinePanel` → `CharacterChecks` → `AdditionEditor`. Die betroffenen Komponententests und `e2e/characters.spec.ts` werden auf den Zauberstab umgeschrieben.
- Sichtbarkeit: Zauberstab-Knopf am Feld (oben rechts im Label bzw. im Feld), immer sichtbar wenn KI aktiv; Stil nach `packages/web/DESIGN.md`.

### 7.4 Tests

- Shared: Schema-Validierung (`AiTextBody` Grenzfälle, Markierung außerhalb, `generate` mit Text).
- Server: Kontextaufbau je `kind` inkl. Entwurf-über-gespeichert und Anlegen ohne ID; Prompt-Aufbau je Aktion; Parsing/Kürzen inkl. Limit des Gesamttexts und Einzeiligkeit; Route mit Fake/Stub-Client (503, 400, 404, 502, Erfolg).
- Web (Vitest/RTL): Menü je Zustand (leer, Markierung zu kurz, voll), Einsetzen in Markierung und ganzes Feld, Wechseln, ↶, Escape, Weitertippen schließt, Antwort nach Tippen verworfen, Fehlermeldung.
- E2E (Playwright, `AI_FAKE=1`): Storyline-Beschreibung umformulieren → Vorschlag 2 wählen → Feld verlassen → gespeichert; Markierung + Escape → unverändert; Figurenfeld mit Zauberstab statt alter Box (bestehende Figuren-E2E anpassen).

## 8. Akzeptanzkriterien (Abbildung)

| AC | Abdeckung |
|---|---|
| AC-001 | 6.2 Schritt 2 ohne Markierung |
| AC-002 / AC-006 | 6.2 Schritt 2 mit Markierung |
| AC-003 | 6.2 Schritt 4 |
| AC-004 | 6.2 Schritt 5, 3 Vorschläge |
| AC-005 | 6.2 Schritt 6 |
| AC-007 | 6.3 „Leeres Umfeld“ (leeres Feld allein deaktiviert nicht, Entscheidung 6 in Abschnitt 5) |
| AC-008 | 6.4 |
| AC-009 | 6.2 Schritt 7 (Escape/✕) |

## 9. Dem Builder überlassen

Genaue Platzierung und Optik von Knopf, Menü und Leiste; Tastenkürzel zum Wechseln; Aufteilung der Web-Komponenten; genauer Prompt-Wortlaut im Rahmen von 6.5; Modellwahl bleibt Konfiguration (`OPENROUTER_MODEL`).
