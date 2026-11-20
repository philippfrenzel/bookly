# Design: Charaktere verwalten (Steckbriefe, Anpassungen, KI-Prüfung)

Stand: 2026-11-20 · Grundlage: Anforderungsdokument „Charaktere verwalten“ (FR-001–FR-007, BR-001/002, DR-001, AC-001–AC-006, EC-001/002, Q-002), ergänzt durch die Klärung mit dem Auftraggeber. Baut auf `2026-11-20-storylines-design.md` auf.

## 1. Absicht und Warum

Figuren (Personen, Tiere, …) sollen sich über das ganze Buch hinweg integer und authentisch verhalten. Dafür bekommen die bestehenden Figuren echte **Steckbriefe** (Beschreibung, Verhaltensmuster, Absichten), die pro Storyline **ergänzt** werden können, wenn sich eine Figur entwickelt. Eine **KI** schlägt Verhaltensmuster und Absichten vor und **warnt**, wenn eine Storyline nicht zu den dort gültigen Steckbriefen passt. Wie im MVP gilt: Das Werkzeug hilft beim Denken, entscheidet aber nicht. Warnungen blockieren nie, Vorschläge überschreiben nie.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Steckbrief pro Figur mit Name, Beschreibung, Verhaltensmuster, Absichten. Alle Felder optional (FR-001, FR-002, DR-001, EC-001).
- Zuordnung von Figuren zu einer oder mehreren Storylines (FR-003; besteht bereits).
- Storyline-spezifische Ergänzung von Verhaltensmuster und Absichten pro Zuordnung (FR-004, EC-002).
- KI-Vorschläge für Verhaltensmuster und Absichten, manuell übernehmbar/verwerfbar (FR-005).
- KI-Warnungen bei Widersprüchen zwischen Storyline und Figur, nach dem Speichern automatisch und auf Anfrage (FR-006, FR-007).

**Nicht-Ziele**
- Szenen (werden gesondert verwaltet).
- Ein eigenes Datenmodell für Beziehungen zwischen Figuren. Beziehungen stehen im Freitext (Beschreibung) und werden von der KI daraus gelesen.
- Anpassungen auf Abschnitts-Ebene.
- Prüfung zeitlicher Überschneidungen („zwei Orte gleichzeitig“): bleibt die bestehende regelbasierte Prüfung `character_overlap` der Storyline-Verwaltung.

**Anti-Ziele**
- Die KI ändert Steckbriefe oder Storylines eigenmächtig.
- Speichern wird langsam oder scheitert, weil die KI nicht erreichbar ist.
- Warnungen sind so häufig oder vage, dass der Autor sie ignoriert.
- Unkontrollierte Kosten: jede kleine Änderung löst einen KI-Aufruf aus.

## 3. Rahmenbedingungen

- Bestehender Stack: React/Vite (`packages/web`), Fastify + Drizzle/PostgreSQL (`packages/server`), gemeinsame Typen/Zod-Schemas/Regeln (`packages/shared`). Oberfläche Deutsch.
- **KI-Anbindung über OpenRouter** (vom Auftraggeber entschieden), OpenAI-kompatible Chat-Completions-API.
- Ohne konfigurierten Schlüssel muss die App vollständig ohne KI funktionieren.
- Datenschutz: Storyline- und Steckbrief-Texte werden an OpenRouter bzw. den gewählten Modellanbieter gesendet. Das ist mit der Konfiguration des Schlüssels in Kauf genommen.

## 4. Approaches (betrachtete Umsetzungswege)

Frage: Wie wird die KI-Prüfung nach dem Speichern ausgelöst?

| | Aufbau | Vorteil | Nachteil |
|---|---|---|---|
| 1 | Web-App ruft nach erfolgreichem Speichern einen Prüf-Endpunkt auf | Kein Hintergrunddienst, kein Polling | Prüfung entfällt, wenn der Tab vorher geschlossen wird |
| **2 (gewählt)** | Server stellt beim Speichern einen Prüfauftrag ein und arbeitet ihn im Hintergrund ab; Web-App fragt den Stand ab | Prüfung läuft unabhängig vom Browser weiter | Warteschlange, Worker und Polling als zusätzliche Teile |
| verworfen | KI-Aufruf synchron im Speichern | – | Speichern dauert Sekunden und scheitert ohne KI; widerspricht „Speichern bleibt sofort“ |

**Gewählt: 2**, vom Auftraggeber entschieden. Damit Aufträge einen Server-Neustart überleben, liegt die Warteschlange in PostgreSQL (eigene Tabelle), nicht im Speicher *(Builder-Entscheidung)*.

## 5. Vom Auftraggeber entschiedene Punkte

1. KI läuft **in der App** (Server ruft das Modell), nicht als externer Agent.
2. Anbieter: **OpenRouter**.
3. Storyline-spezifische Anpassung ist eine **Ergänzung**: Der Grundsteckbrief bleibt gültig, die Anpassung beschreibt, was in dieser Storyline anders ist.
4. Anpassungen werden **in der Storyline bei der Figur** gepflegt.
5. Prüfung **im Hintergrund auf dem Server** (Approach 2).
6. Die in den vorigen Gesprächsschritten vorgeschlagenen Punkte (Abschnitte 6–8) wurden mit „passt so“ bestätigt: Speichern sofort, Prüfung im Hintergrund, Ergebnisse gespeichert und quittierbar, Beziehungen aus dem Freitext, Anpassungen nur auf Storyline-Ebene, Vorschläge nie beim bloßen Öffnen.
7. **„Bewusst so“ dämpft die ganze Art** (Kriterium) pro Figur und Storyline, nicht nur die einzelne Warnung.

## 6. Fachliches Modell

**Figur (Steckbrief)**: `name`, `description`, `behavior` (Verhaltensmuster), `intentions` (Absichten). Alle optional, Freitext. Heute ist `name` Pflicht; das wird gelockert (Migration: `NOT NULL` entfällt). Eine leere Figur ist erlaubt (EC-001). Ohne Namen zeigt die Oberfläche „Unbenannte Figur“, in Hinweistexten ebenso. Sortierungen nach Name setzen unbenannte Figuren ans Ende.

**Zuordnung Storyline ↔ Figur** (`storyline_characters`, besteht): bekommt zwei optionale Freitext-Spalten `behavior` und `intentions` = die **Ergänzung** für diese Storyline (FR-004). Für die Prüfung gilt in einer Storyline: *Grundsteckbrief + Ergänzung*. Jede Zuordnung hat ihre eigene Ergänzung (EC-002).

**Abschnitte** behalten ihre reine Figuren-Zuordnung ohne Ergänzung. Eine Figur, die nur einem Abschnitt (nicht der Storyline selbst) zugeordnet ist, wird mit ihrem Grundsteckbrief geprüft *(Builder-Entscheidung)*.

**Entfernen einer Figur aus der Storyline** löscht ihre Ergänzung mit. Enthält die Ergänzung Text, fragt die Oberfläche vorher nach.

**Kriterienkatalog (BR-001, BR-002).** Vier Kriterien für Widersprüche Storyline ↔ Figur:

| Kriterium | Wo geprüft |
|---|---|
| `behavior_change` – Verhalten weicht vom gültigen Verhaltensmuster ab, ohne dass eine Ergänzung das abdeckt | KI |
| `intention_conflict` – Handeln widerspricht den gültigen Absichten, oder Absichten widersprechen sich | KI |
| `relationship_conflict` – Widerspruch zu Beziehungen zwischen Figuren, wie sie in den Steckbriefen beschrieben sind | KI |
| zeitliche Überschneidung (zwei Orte gleichzeitig) | bestehende Regel `character_overlap` |

Die KI-Kriterien liegen als Liste in `packages/shared` (Schlüssel, deutsches Label, Beschreibung für den Prompt). Ein neues Kriterium = ein neuer Eintrag; Prompt, Antwort-Schema und Oberfläche lesen die Liste.

## 7. KI-Prüfung (FR-006, FR-007)

**Prüfeinheit ist eine Storyline.** Eingabe an das Modell:
- Titel, Beschreibung, Notiz der Storyline; Titel, Beschreibung, Notiz ihrer Abschnitte in Reihenfolge, je mit den dort eingetragenen Figuren.
- Für jede Figur der Storyline (inkl. Abschnitts-Figuren): Name, Beschreibung, Verhaltensmuster, Absichten, und, falls vorhanden, die Ergänzung dieser Storyline.
- Die drei KI-Kriterien mit Beschreibung.
- Quittierungen werden **nicht** an das Modell gegeben: Die KI meldet unabhängig davon, die Dämpfung passiert nur in der Darstellung *(Builder-Entscheidung, folgt aus Punkt 7 der Entscheidungen)*.

**Antwort**: JSON nach festem Schema (`response_format: json_schema`), validiert mit Zod. Liste von Warnungen mit `characterId`, `criterion`, `message` (deutsch, ein bis zwei Sätze, nennt die Textstelle). Unbekannte Figuren-IDs oder Kriterien werden verworfen. Leere Liste = keine Widersprüche.

**Wann geprüft wird**
- **Automatisch:** Nach jeder erfolgreichen Änderung, die die Eingabe einer Storyline verändert: Storyline/Abschnitte bearbeitet, Figuren zugeordnet/entfernt, Ergänzung geändert, Steckbrief einer zugeordneten Figur geändert (→ alle Storylines dieser Figur). Das Einstellen passiert im Server direkt nach `mutateBook`, nicht im Browser.
- **Auf Anfrage:** Knopf „Figuren prüfen“ an der Storyline und „Alle prüfen“ in der Hinweisliste. Stellt einen Auftrag ein, auch wenn sich nichts geändert hat.

**Fingerabdruck gegen unnötige Aufrufe.** Aus der Modell-Eingabe (ohne quittierte Warnungen), der Kriterien-Version und dem Modellnamen wird ein Hash gebildet. Automatische Prüfungen werden nur eingestellt, wenn er sich vom Hash der letzten erfolgreichen Prüfung unterscheidet.

**Warteschlange (Tabelle `character_checks`)**, ein Eintrag pro Storyline: `storyline_id` (eindeutig), `status` (`pending` | `running` | `done` | `failed`), `input_hash`, `requested_at`, `started_at`, `finished_at`, `error`, `model`.
- Einstellen = Upsert auf `pending` mit neuem `requested_at`. Mehrere Speichervorgänge kurz hintereinander verschmelzen so zu einem Auftrag.
- **Ruhezeit:** Der Worker nimmt einen Auftrag erst, wenn `requested_at` mindestens 5 s zurückliegt *(Builder-Entscheidung, spart Kosten beim Tippen)*.
- **Worker** im Server-Prozess: fragt alle ~2 s die Tabelle ab (`FOR UPDATE SKIP LOCKED`), höchstens 2 Aufträge gleichzeitig. Startet nur, wenn ein Schlüssel konfiguriert ist.
- Ändert sich die Storyline, während ihr Auftrag läuft, wird nach dem Abschluss erneut verglichen und bei abweichendem Hash wieder `pending` gesetzt.
- Beim Serverstart werden `running`-Einträge, die älter als 5 min sind, auf `pending` zurückgesetzt.
- Fehler (Netz, Zeitüberschreitung 60 s, ungültige Antwort): `failed` mit kurzer Meldung, kein automatischer Wiederholungsversuch; die alten Warnungen bleiben stehen. Wiederholen per Knopf.

**Ergebnisse (Tabelle `character_warnings`)**: `id`, `storyline_id`, `character_id`, `criterion`, `message`, `created_at`. Ein erfolgreicher Lauf ersetzt alle Warnungen der Storyline in einer Transaktion. Löschen von Storyline oder Figur löscht ihre Warnungen mit (Cascade).

**Quittieren („Bewusst so“)** (vom Auftraggeber entschieden). Eine Quittierung gilt für die **ganze Art pro Figur und Storyline**: Tabelle `character_warning_acks` mit Schlüssel *Storyline + Figur + Kriterium*. Alle Warnungen mit diesem Schlüssel erscheinen gedämpft, auch neue aus späteren Prüfungen. Die Oberfläche sagt das beim Quittieren ausdrücklich („Auch künftige Hinweise dieser Art für Anna in dieser Storyline werden gedämpft“) und zeigt gedämpfte Warnungen weiterhin an, damit nichts verschwindet. Quittierungen bleiben bestehen, bis der Autor sie zurücknimmt; sie werden nicht automatisch gelöscht. Entfernen der Figur aus der Storyline oder Löschen von Figur/Storyline löscht sie mit.

**Ohne Schlüssel** werden keine Aufträge eingestellt; die Buch-Antwort meldet `ai.enabled = false`.

## 8. KI-Vorschläge (FR-005, Q-002)

- **Grundsteckbrief:** `POST /api/books/:bookId/characters/:characterId/suggestion` mit dem aktuellen (ggf. ungespeicherten) Entwurf. Antwort `{ behavior, intentions }`. Synchroner Aufruf, Zeitüberschreitung 30 s.
- **Ergänzung:** `POST /api/books/:bookId/storylines/:storylineId/characters/:characterId/suggestion`. Das Modell bekommt zusätzlich den Storyline-Text und schlägt nur vor, was in dieser Storyline anders ist.
- **Auslöser:** Die Beschreibung (bzw. bei der Ergänzung: der Storyline-Text) wurde geändert und das Feld verlassen, oder der Knopf „Vorschlagen“. **Beim bloßen Öffnen nie** (beantwortet Q-002).
- Bei Ergänzungen löst eine Änderung des Storyline-Texts automatisch nur für Figuren aus, deren Ergänzung gerade **aufgeklappt** ist; für alle anderen nur per Knopf *(Builder-Entscheidung, begrenzt Aufrufe bei vielen Figuren)*.
- Ergänzungen gibt es erst, wenn die Storyline angelegt ist. Im Anlege-Modus bleiben die Figuren reine Häkchen ohne Aufklapp-Pfeil; das Anlege-Schema (`characterIds`) bleibt unverändert *(Builder-Entscheidung)*.
- **Darstellung:** Kasten unter den Feldern mit dem Vorschlag pro Feld und „Übernehmen“ / „Verwerfen“. Übernehmen ersetzt den Feldinhalt (bei nicht leerem Feld nach Rückfrage); erst dann wird gespeichert. Vorschläge werden nicht gespeichert.
- Läuft bereits ein Vorschlag für dasselbe Feld, wird kein zweiter gestartet.

## 9. Oberfläche

**Figuren-Panel** (`CharacterPanel`): pro Figur Name, Beschreibung, Verhaltensmuster, Absichten (mehrzeilig, alle optional), „Vorschlagen“, Vorschlagskasten, Löschen wie bisher.

**Storyline-Panel**: Die Figuren-Häkchen (`CharacterChecks`) werden pro angehakter Figur aufklappbar:

```
Figuren
 ☑ Anna   ▾ Ergänzung für diese Storyline
          Verhalten:  [nach dem Verrat misstrauisch gegenüber Jakob]
          Absichten:  [will Jakob vor Gericht bloßstellen        ]
          Grundprofil: zurückhaltend, loyal · will ihre Familie schützen
          [Vorschlagen]
 ☑ Jakob  ▸ Ergänzung (leer)
 ☐ Der Fremde
```

Darüber eine Statuszeile der Prüfung: „Prüfe Figuren…“ (pending/running), „Geprüft vor 2 min“ (done), „Prüfung fehlgeschlagen – erneut versuchen“ (failed), Knopf „Figuren prüfen“. Ohne Schlüssel: „KI nicht eingerichtet“, Knöpfe deaktiviert.

**Hinweisliste** (`BookHints`): neue Gruppe „Figuren“ mit den KI-Warnungen: Storyline, Figur, Kriterium-Label, Meldung, „Bewusst so“. Die bestehenden Regel-Hinweise bleiben unverändert.

**Aktualisierung:** Die Buch-Antwort (`BookResponse`) enthält zusätzlich `characterChecks` (Status je Storyline), `characterWarnings` (mit `acknowledged`) und `ai: { enabled }`. Solange eine Prüfung `pending`/`running` ist, fragt die Web-App das Buch alle 2 s neu ab (React Query `refetchInterval`), sonst nicht.

## 10. Technische Leitplanken

- **Konfiguration** (`.env`, README-Tabelle ergänzen): `OPENROUTER_API_KEY` (ohne → KI aus), `OPENROUTER_MODEL` (Pflicht, wenn Schlüssel gesetzt; das Modell muss strukturierte JSON-Ausgabe unterstützen).
- **OpenRouter-Client** in `packages/server/src/ai/` als schmale Schnittstelle (`complete(messages, schema) → unknown`), per `buildApp`-Option injizierbar. Tests verwenden einen Fake, nie das echte Netz.
- **Prompt-Bau und Antwort-Parsing** als reine Funktionen (testbar ohne Netz); Kriterienliste und Antwort-Schema in `packages/shared`.
- Alle neuen Routen prüfen wie bisher über `guard.ts`, dass Buch, Storyline und Figur dem angemeldeten Nutzer gehören.
- Migration über `drizzle-kit generate` (neue Spalten, neue Tabellen, `name` nullable).
- E2E: ein Ablauf mit Fake-KI (Steckbrief anlegen → Storyline ergänzen → Warnung erscheint → quittieren). Die e2e-Server starten mit einem Fake-Modus *(Builder-Entscheidung: z. B. `AI_FAKE=1`, das feste Antworten liefert)*.

## 11. Dem Builder überlassen

- Genaue Prompt-Formulierung (Deutsch), solange Kriterien und Antwort-Schema eingehalten werden.
- Hash-Verfahren und Kriterien-Versionierung.
- Feinlayout von Vorschlagskasten und Statuszeile im bestehenden Designsystem (`packages/web/DESIGN.md`, falls vorhanden).
- Längenlimits der neuen Freitextfelder (Orientierung: Beschreibung 2000 Zeichen wie bisher, Verhalten/Absichten je 2000).
