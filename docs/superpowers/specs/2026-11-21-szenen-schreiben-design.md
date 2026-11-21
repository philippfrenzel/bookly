# Design: Szenen schreiben (Textblöcke je Zuordnung, Buchumfang, Zauberstab je Block)

Stand: 2026-11-21 · Grundlage: vom Auftraggeber freigegebenes Produktdesign aus der Übergabe „Spookly scene writing“ (AIgile Works, Claude-Implementierungsrolle). **Keine RefinIQ-Qualifizierung angefordert**; es gibt daher keine Spezifikations-ID, keinen Score und keine Übergabebewertung. Baut auf `2026-11-21-szenen-design.md`, `2026-11-20-ki-textfelder-design.md` und `2026-11-21-kapitelstruktur-design.md` auf.

## 1. Absicht und Warum

Autorinnen und Autoren schreiben eine Szene nicht in einem Rutsch. Sie wollen den Text einer Szenen-Zuordnung in **geordnete Blöcke** gliedern, an einer Stelle teilen, einen leeren Block einschieben und **nur diesen** von der KI entwerfen lassen – z. B. die Antwort einer Figur –, ohne dass der Rest angetastet wird. Dieselbe Szene (der Ort) kann in einem Strang ein Dialog und in einem anderen eine knappe Erinnerung sein; deshalb gehören Blöcke zur **Zuordnung**, nicht zur Szene. Damit die KI den Umfang trifft, bekommt das Buch einen **ungefähren Zielumfang in Wörtern**, und beim Erzeugen wählt man „knapp“, „passend zum Buch“ oder „ausführlich“.

## 2. Freigegebene Akzeptanz (wörtlich übernommen, Kurzform)

- **A1 Buchumfang:** Je Buch optional ein ungefährer Zielbereich in Wörtern; speichern, ändern, lesen. Beim KI-Erzeugen „knapp“, „passend zum Buch“ (Standard), „ausführlich“. Der Bereich leitet das ganze Manuskript, **nie** eine Quote je Szene. Ohne Bereich und für alte Bücher/Anfragen verhält sich alles wie bisher.
- **A2 Blöcke:** Für jede Zuordnung (Abschnitt im Hauptstrang oder ganze Storyline, z. B. Nebenstrang) geordnete Textblöcke. „Block einfügen“ am Absatzende, „Hier teilen“ an der tatsächlichen Schreibmarke, Teilung rückgängig machen. Bestehende Texte und Zuordnungen überleben die Migration (Manuskript-Erzeugung/-Vorschau und die Leser der bisherigen Beschreibungen beachten); Reihenfolge und exakter Text bleiben; Validierung, Atomarität und gleichzeitige Änderungen werden beim Speichern behandelt. Die wiederverwendbare Szene behält Bild und Notizen; Blöcke gehören der Zuordnung und werden nie zwischen Zuordnungen derselben Szene geteilt.
- **A3 Zauberstab:** Der vorhandene Zauberstab schreibt nur die Markierung oder den aktiven Block um und entwirft einen neu eingefügten leeren Block. Der Rest bleibt. Kontext: die an dieser Zuordnung beteiligten Figuren und der umgebende Text. Der Server leitet den Kontext unter den bestehenden Rechten selbst ab; kein Rückfall, der andere Blöcke verändert. Rückgängig/Abbrechen und normales Bearbeiten bleiben.
- **A4 Tests:** Vollständiges Beispiel als gezielter Test: vor der Antwort einer Figur teilen, einen Block einfügen, nur diese Antwort erzeugen. Beide Zielarten, alte gespeicherte Daten, gespeicherte Reihenfolge sowie Markierung/lokale Bearbeitung absichern. Konkrete Grenzen nennen.

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele:** A1–A4.

**Nicht-Ziele:** Blöcke verschieben per Drag & Drop; Blöcke zwischen Zuordnungen kopieren oder teilen; Rich Text; Echtzeit-Kollaboration im Szenentext; Wortzähler/Fortschrittsanzeige gegen den Buchumfang; eine Längenwahl für Kapitelstruktur-Vorschläge.

**Anti-Ziele (Fehlschlag, auch wenn es „funktioniert“):** Die KI verändert einen anderen Block als den Zielblock. Eine Teilung verliert oder verändert Zeichen. Eine alte Beschreibung geht bei der Migration verloren. Der Buchumfang wird als Wortquote pro Szene/Block in den Prompt geschrieben. Ein veralteter Browser-Tab überschreibt still neuere Blöcke.

## 4. Ansätze

| Ansatz | Kurz | Abwägung |
|---|---|---|
| **A (gewählt)** Eigene Tabelle `scene_assignment_blocks`, `description` bleibt als abgeleitete Gesamtfassung | Blöcke sind die Quelle; bei jedem Schreiben wird `description = Blöcke mit "\n\n" verbunden` in derselben Transaktion gesetzt; `revision` zählt Änderungen | Alle bisherigen Leser (Manuskript-Struktur, KI-Entwurf, „Frühere Beschreibung“, Szenenliste) laufen unverändert weiter; Migration ist ein einfaches `INSERT … SELECT`; ein PUT ersetzt die Liste atomar. Kosten: eine Spalte doppelt gehalten. |
| B `description` als JSON-Array von Blöcken | keine neue Tabelle | Alle Leser müssen umgebaut werden; Block-IDs für Zauberstab-Ziel umständlich; alte Clients brechen. |
| C Blöcke durch Leerzeilen im bestehenden Text kodieren | keine Migration | Exakter Text nicht garantiert (Leerzeilen im Text selbst), keine stabilen Block-IDs, keine Atomarität je Block. |

B und C verletzen A2 (exakter Text/Leser) bzw. A3 (stabiles Ziel). **A** ist der eine sinnvolle Weg.

## 5. Entscheidungen (Builder-Calls, leicht änderbar)

| Punkt | Entscheidung |
|---|---|
| Datenmodell | `scene_assignment_blocks (id, assignment_id → scene_assignments cascade, position int, text, updated_at)`, eindeutig `(assignment_id, position)`. `scene_assignments.revision int not null default 0`. |
| Migration `0008` | Jede bestehende Zuordnung bekommt **genau einen** Block mit `text = description` (exakt, auch leer), `position 0`. Kein Datenverlust, Reihenfolge trivial. |
| Abgeleitete `description` | Bei jedem Block-Schreiben: Texte in Reihenfolge, getrennt durch `"\n\n"`. Ein einzelner Block → exakt sein Text, also identisch zu alten Daten. Readers (Strukturvorschlag, KI-Entwurf) kürzen die Szenenfassung auf 2000 Zeichen, damit lange Szenentexte die Prompts nicht sprengen. |
| Speichern der Blöcke | `PUT /api/books/:bookId/scene-assignments/:id/blocks` mit `{ revision, blocks: [{ id?, text }] }`: ersetzt die geordnete Liste atomar (Buchzeile gesperrt via `app.mutate`). Bekannte IDs müssen zur Zuordnung gehören (sonst 400 `unknown_block`), doppelte IDs 400, neue Blöcke ohne `id`. `revision` ≠ gespeicherte → **409 `stale`**; nichts wird geschrieben. Erfolg erhöht `revision`. |
| Grenzen | Je Block höchstens 10 000 Zeichen, 1–200 Blöcke je Zuordnung (mindestens einer). Texte werden **nicht** getrimmt, damit eine Teilung exakt bleibt. |
| Alte Anfragen | `PATCH …/scene-assignments/:id` mit `description` bleibt: ersetzt alle Blöcke durch einen Block mit diesem Text (das bisherige „ganze Beschreibung ersetzen“, z. B. „Frühere Beschreibung einsetzen“ + „Übernehmen“). Optionales `revision` im Body prüft wie oben auf 409; ohne `revision` verhält es sich wie früher. Anlegen (`POST`) legt einen Block mit der Startbeschreibung an. |
| Teilen | „Hier teilen“ teilt den aktiven Block an der Schreibmarke: `vorher = text.slice(0, c)`, `nachher = text.slice(c)` – keine Zeichen gehen verloren oder kommen hinzu. Nur aktiv, wenn `0 < c < Länge` und keine Markierung. |
| Teilung rückgängig | Nach einer Teilung erscheint „Teilung rückgängig“; es verbindet die beiden Blöcke wieder zum Originaltext, solange beide Hälften unverändert sind (sonst verschwindet die Option, damit keine Bearbeitung verloren geht). |
| Block einfügen | „Block einfügen“ legt hinter dem aktiven Block (ohne aktiven Block: am Ende) einen leeren Block an und fokussiert ihn. Ein leerer Block kann mit „Leeren Block entfernen“ wieder weg (nur leer, damit kein Text verloren geht). |
| Speichern von Text | Beim Verlassen eines Blocks, wenn sich sein Text geändert hat; Strukturänderungen (teilen, einfügen, rückgängig, entfernen) sofort. Bei 409 Meldung „Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.“ und Neuladen; der lokale Text bleibt nicht still verloren: die Meldung nennt das, der Block zeigt danach den gespeicherten Stand. |
| Zauberstab-Ziel | Neue `AiTextTarget`-Art `sceneBlock { assignmentId, blockId, field: 'text' }`, Feldgrenze 10 000, mehrzeilig. Der Client schickt nur den Text des aktiven Blocks; der Server lädt Zuordnung, Blöcke, Szene, Ziel (Abschnitt/Storyline) und Figuren selbst und prüft, dass Block → Zuordnung → Szene → Buch gehören (sonst 404). Die Antwort ersetzt nur Markierung bzw. Block im Feld; andere Blöcke werden nie berührt, weil sie nicht Teil der Anfrage sind. |
| Kontext Zauberstab | Buch, Szene (Name, Notizen bis 4000 Zeichen), Ort der Zuordnung (Abschnitt bzw. Storyline mit Beschreibung, Storyline-Titel), **Figuren dieser Zuordnung** (Abschnittsfiguren bzw. Storyline-Figuren, mit Beschreibung), **umgebender Text** (`textDavor`: letzte 3000 Zeichen der vorherigen Blöcke, `textDanach`: erste 1500 Zeichen der folgenden Blöcke), Zielumfang des Buchs als Orientierung, Längenwahl. „Vorschlagen“ ist für einen leeren Block immer möglich. |
| Längenwahl | `length: 'short' \| 'book' \| 'long'` (Anzeige „knapp“, „passend zum Buch“, „ausführlich“), Standard `book`. Am Zauberstab der Szenenblöcke (Auswahl „Länge“ über den Blöcken) und am „KI-Entwurf“ eines Manuskript-Bausteins. Optional in den Bodies; fehlt es, gilt `book`. |
| Prompt-Text Umfang | Mit Bereich: „Das ganze Buch soll insgesamt etwa X–Y Wörter umfassen. Das ist keine Vorgabe für diese Passage; wähle den Umfang so, wie der Inhalt es im Verhältnis zum ganzen Buch braucht.“ `short`/`long` ergänzen „eher knapp“/„eher ausführlich“. Ohne Bereich und mit `book` bleibt der Entwurfs-Prompt **wortgleich** wie bisher (300–600 Wörter); `short`/`long` ohne Bereich: 150–300 bzw. 600–1000 Wörter. |
| Buchumfang Datenmodell | `books.target_words_min`, `books.target_words_max` (int, null). `Book.targetWords?: { min, max } \| null`. `PATCH /api/books/:id` akzeptiert zusätzlich `targetWords` (`null` löscht); `title` wird optional, mindestens ein Feld nötig. 1 ≤ min ≤ max ≤ 2 000 000. |
| Buchumfang UI | Manuskriptseite, Abschnitt „Umfang“ neben „Stil“: zwei Zahlenfelder „von“/„bis“ (Wörter), „Speichern“, „Entfernen“. Nur für die Eigentümerin/den Eigentümer editierbar (bestehende Buchrechte), Prüfer sehen den Wert nur. |

## 6. Grenzen (ehrlich)

- Gleichzeitige Bearbeitung derselben Zuordnung in zwei Tabs: der zweite Speichervorgang bekommt 409 und lädt neu; ungespeicherter Text des abgelehnten Blocks muss neu eingegeben werden (Meldung sagt das). Kein Zusammenführen.
- Der Zauberstab sieht andere Blöcke nur im gespeicherten Stand (sie werden beim Verlassen gespeichert, also praktisch immer aktuell).
- Die KI kann trotz Prompt den Umfang verfehlen; die Antwort wird auf 10 000 Zeichen je Block gekürzt.
- „Frühere Beschreibung einsetzen“ und „Neu erzeugen“ ersetzen weiterhin die **ganze** Fassung einer Zuordnung (ausdrückliche Wahl mit „Übernehmen“) und fassen dabei die Blöcke zu einem zusammen; das ist die bisherige Funktion und wird im UI so beschriftet.
- Die abgeleitete Gesamtfassung verbindet Blöcke mit einer Leerzeile; wer einen Block selbst mit Leerzeile beginnt, sieht sie in der Gesamtfassung doppelt.

## 7. Abbildung Akzeptanz → Nachweis

| Akzeptanz | Nachweis |
|---|---|
| A1 | Server-Test Buch-PATCH (setzen, ändern, löschen, alte `{title}`-Anfrage), Prompt-Tests (mit/ohne Bereich, drei Längen, keine Quote je Szene), Web-Test Umfang-Panel |
| A2 | Migrationstest (alte Zeile → ein Block, exakter Text), Server-Tests PUT (Reihenfolge, Atomarität bei ungültiger ID, 409 bei veralteter Revision, fremde Block-ID), beide Zielarten, Web-Tests Teilen/Einfügen/Rückgängig |
| A3 | Server-Test Kontext (Figuren der Zuordnung, umgebender Text, Fremd-ID 404), Web-Test Zauberstab ersetzt nur Markierung/aktiven Block |
| A4 | E2E `scene-writing.spec.ts` mit Fake-KI: Dialog teilen, Block einfügen, nur Antwort erzeugen, Reihenfolge nach Neuladen |
