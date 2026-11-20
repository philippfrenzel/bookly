# Design: Storylines für ein Buch entwickeln und pflegen (MVP)

Stand: 2026-11-20 · Grundlage: RefinIQ Handover Package v2 (`SRR-2026-000001`), ergänzt durch die Klärung mit dem Auftraggeber.

## 1. Absicht und Warum

Autoren verlieren bei komplexen Büchern den Überblick über ihre Handlungsstränge. bookly gibt ihnen eine **grafische Vogelperspektive** auf alle Storylines eines Buchs, damit der rote Faden sichtbar bleibt und die Geschichte in sich stimmig ist („Story ergibt Sinn“). Das Werkzeug **hilft beim Denken, entscheidet aber nicht**: Es weist auf Widersprüche hin, ändert aber nie etwas selbst.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele (MVP)**
- Storylines grafisch anlegen, bearbeiten, löschen (FR-001).
- Haupt- und Nebenstränge visuell klar unterscheiden: Linienstärke, Farbe, Position (FR-008), jederzeit umstellbar (FR-009).
- Hauptstränge in Abschnitte unterteilen (FR-010, FR-011).
- Status verwalten: *in Bearbeitung* (Startstatus), *abgeschlossen*, *bewusst offen*, jeweils mit Farbe und Symbol (FR-002, Q-003 entschieden).
- Typisierte Verbindungen zwischen Storylines mit Freitext (FR-003, FR-004).
- Sofortige Hinweise auf zeitliche Widersprüche und Figurenüberschneidungen beim Erstellen einer Verbindung (FR-005–FR-007).
- Filter, Zoom, einblendbare Notizen (FR-013–FR-015).
- Mehrere Autoren mit eigenem Konto; jeder sieht nur seine Bücher.

**Nicht-Ziele**
- Ausformulierung der Story-Inhalte (Kapiteltexte, Szenen) – laut Spec out of scope.
- Gemeinsames Bearbeiten eines Buchs durch mehrere Personen, Echtzeit-Kollaboration.
- Export/Import, Druckansicht, mobile App.
- Konto-Funktionen über Registrierung, Login und Logout hinaus: kein Passwort-Reset, keine E-Mail-Bestätigung, keine Kontolöschung, kein E-Mail-Versand (vom Auftraggeber entschieden).
- KI-Vorschläge zur Handlung.

**Anti-Ziele** (wäre ein Misserfolg, selbst wenn es technisch funktioniert)
- Das System ändert Daten eigenmächtig, um einen Widerspruch aufzulösen (BR-002).
- Warnungen sind so häufig oder ungenau, dass der Autor sie ignoriert (Fehlalarme).
- Die Grafik wird bei vielen Storylines unlesbar (R-001) – Filter und Zoom müssen das abfangen.
- Eine feste Obergrenze für Storylines (BR-001).

## 3. Rahmenbedingungen

- Web-App mit Backend; mehrere Nutzer, je Konto isolierte Daten.
- Sprache der Oberfläche: Deutsch.
- Repository `bookly` ist leer; es gibt nichts Bestehendes zu berücksichtigen.
- Keine nicht-funktionalen Vorgaben in der Spec; siehe Abschnitt 8 für die getroffenen Annahmen.

## 4. Approaches (betrachtete Umsetzungswege)

| | Aufbau | Vorteil | Nachteil |
|---|---|---|---|
| **A (gewählt)** | React-SPA (Vite, TypeScript) + eigener Fastify-Server (TypeScript) + PostgreSQL | Klare Trennung Oberfläche/API; ein Sprach-Stack; Prüflogik als gemeinsames Paket in Browser und Server | Zwei Prozesse zu starten/betreiben |
| B | Next.js als ein Projekt | Weniger Einrichtung, ein Deployment | SSR bringt für eine reine Zeichenfläche wenig; Grenze Client/Server verwischt |
| C | React-SPA + Python/FastAPI | Passend bei Python-Vorliebe | Prüflogik müsste doppelt (TS + Python) existieren |

**Gewählt: A** – vom Auftraggeber entschieden. Ausschlaggebend: Die Storyline-Grafik ist eine reine Browser-Anwendung, und die Widerspruchsprüfung soll sofort im Browser laufen und serverseitig identisch nachprüfbar sein.

## 5. Vom Auftraggeber entschiedene Punkte

1. **Plattform:** Web mit Backend.
2. **Stack:** Variante A (React + Fastify + PostgreSQL, alles TypeScript).
3. **Zeitraum = Story-Zeitachse:** Jedes Buch hat eine eigene, geordnete Liste von Zeitpunkten mit frei wählbaren Namen („Kindheit“, „Tag 1“, „3 Jahre später“). Ein Zeitraum ist *von Zeitpunkt X bis Zeitpunkt Y* (X ≤ Y in der Reihenfolge). Prüfungen vergleichen nur die Reihenfolge, keine Kalenderdaten.
4. **Status:** drei Werte – *in Bearbeitung* (Startstatus bei Neuanlage), *abgeschlossen*, *bewusst offen*.
5. **Konten im MVP:** nur Registrierung, Login und Logout.

## 6. Fachliches Modell

Alle Objekte gehören zu genau einem Buch, das Buch zu genau einem Nutzer.

- **Nutzer:** E-Mail, Passwort (gehasht), Anzeigename.
- **Buch:** Titel. Ein Nutzer hat beliebig viele Bücher.
- **Zeitpunkt:** Name, Position in der Reihenfolge des Buchs. Einfügen, umbenennen, umsortieren, löschen. Löschen nur, wenn kein Zeitraum ihn verwendet (sonst Hinweis, welche Elemente betroffen sind).
- **Figur:** Name, optional kurze Beschreibung. Figurenliste pro Buch. Storylines und Abschnitte verweisen auf Figuren (n:m). Löschen einer Figur entfernt sie aus allen Zuordnungen nach Bestätigung. Verbindungen vom Typ *Figur wechselt*, die diese Figur nennen, bleiben bestehen, ihre Figur wird leer, und sie erhalten den Hinweis „Figur fehlt“ *(Builder-Entscheidung)*. Das Figurenfeld dieser Verbindung ist daher technisch optional, fachlich aber erwartet.
- **Storyline** (FR-012, DR-001): Titel, kurze Beschreibung, beteiligte Figuren, Zeitraum (Start-/End-Zeitpunkt), Art (*Hauptstrang*/*Nebenstrang*), Status, Farbe, optionale Notiz.
  - Titel und Zeitraum sind Pflicht; Beschreibung, Figuren, Notiz optional.
  - Farbe: Standardfarbe je Art vorbelegt, vom Autor änderbar.
- **Abschnitt** (nur bei Hauptsträngen): dieselben Felder wie die Storyline (Titel, Beschreibung, Figuren, Zeitraum, Notiz), Reihenfolge im Strang. Der Zeitraum eines Abschnitts muss innerhalb des Zeitraums seines Strangs liegen; Abschnitte dürfen sich nicht überlappen, **dürfen sich aber einen Grenz-Zeitpunkt teilen** (Ende von Abschnitt 1 = Beginn von Abschnitt 2 ist erlaubt). Verstöße sind Validierungsfehler, keine Warnung. *(Builder-Entscheidung)*
- **Verbindung:** von Storyline A nach Storyline B (gerichtet, A ≠ B), Typ, optionaler Freitext. Typen: *Figur wechselt*, *Zeitsprung*, *Handlungsstränge vereinigen sich*, *Rückblende*. Bei *Figur wechselt* wird zusätzlich die wechselnde Figur ausgewählt.

**Semantik von Zeiträumen** *(Builder-Entscheidung)*: Ein Zeitraum „X bis Y“ schließt X und Y ein. Zwei Zeiträume **überlappen**, wenn sie mindestens einen Zeitpunkt gemeinsam haben (auch nur einen Randpunkt). „A liegt vor B“ heißt: Ende von A hat eine kleinere Position als Beginn von B. Zwei Zeiträume **berühren** sich, wenn sie überlappen oder unmittelbar aufeinanderfolgende Zeitpunkte als Rand haben (Ende von A und Beginn von B sind Nachbarn in der Reihenfolge).

**Änderungen, die Regeln verletzen würden** *(Builder-Entscheidung)*: Jede Änderung, die einen ungültigen Zustand erzeugen würde (Zeitpunkte so umsortieren, dass ein Start nach dem Ende liegt; Strang verkürzen, sodass Abschnitte herausfallen; Zeitpunkt löschen, der verwendet wird), wird **abgelehnt** und zeigt die Liste der betroffenen Elemente. Das System korrigiert nichts selbst (BR-002). Die Prüfung erfolgt im gemeinsamen Paket und serverseitig in einer Transaktion. Der Datenbestand ist damit immer gültig.

**Regeln zu Änderungen**
- **Haupt- → Nebenstrang (EC-003):** Hat der Strang Abschnitte, erscheint eine Warnung. Nach Bestätigung werden die Abschnitte als Text (Titel, Zeitraum, Beschreibung) an die Notiz der Storyline angehängt und dann entfernt – nichts geht verloren.
- **Storyline löschen (EC-004):** Warnung mit Anzahl der betroffenen Verbindungen; nach Bestätigung werden Storyline, ihre Abschnitte und ihre Verbindungen gelöscht.
- Keine Obergrenze für die Zahl der Storylines (BR-001).

## 7. Widerspruchsprüfung

Läuft als reine Funktion in einem gemeinsamen TypeScript-Paket: im Browser **sofort beim Erstellen oder Ändern einer Verbindung** (FR-007), auf dem Server beim Speichern identisch. Ergebnis sind **Hinweise, nie Blockaden**: Die Verbindung wird trotzdem gespeichert (BR-002). Hinweise werden an der Verbindung angezeigt und bleiben sichtbar, bis der Grund behoben ist; der Autor kann einen Hinweis als „bewusst so“ quittieren, danach wird er nur noch dezent angezeigt.

Hinweise werden bei jeder relevanten Änderung neu berechnet (Zeitraum, Figuren, Typ, Reihenfolge der Zeitpunkte), nicht nur beim Anlegen. **Hinweise werden nicht gespeichert, sondern immer berechnet** *(Builder-Entscheidung)*. Gespeichert werden nur Quittierungen, mit dem Schlüssel *Verbindung + Regel + Figur (falls zutreffend)*. Verschwindet der Grund eines quittierten Hinweises, wird die Quittierung gelöscht. Tritt er später erneut auf, erscheint er wieder voll sichtbar.

**Datengrundlage der Prüfung** *(Builder-Entscheidung)*: Geprüft wird auf Ebene der Storyline. Ihr Zeitraum ist der Zeitraum der Storyline, ihre Figuren sind die Figuren der Storyline **plus** die Figuren aller ihrer Abschnitte.

**Zeitliche Prüfung (FR-005)** – Vergleich über die Positionen der Zeitpunkte, A = Quelle, B = Ziel:
| Typ | Hinweis, wenn … |
|---|---|
| Zeitsprung | B beginnt nicht nach dem Ende von A |
| Handlungsstränge vereinigen sich | die Zeiträume von A und B sich nicht berühren oder überlappen |
| Rückblende | B beginnt nicht vor dem Beginn von A |
| Figur wechselt | die gewählte Figur nicht in beiden Strängen eingetragen ist |

**Figurenüberschneidung (FR-006)**: Hinweis, wenn eine Figur in A **und** B eingetragen ist und sich die Zeiträume von A und B überlappen. Bewusst nur für **verbundene** Stränge, um Fehlalarme zu vermeiden. Ausnahmen: Beim Typ *Handlungsstränge vereinigen sich* ist gemeinsame Präsenz gewollt, also keine Figurenwarnung. Beim Typ *Figur wechselt* ist die wechselnde Figur von der Überschneidungswarnung ausgenommen, andere Figuren nicht *(Builder-Entscheidung)*.

## 8. Oberfläche

**Hauptansicht pro Buch: Storyline-Karte**
- Horizontale Zeitachse oben (Spalten = Zeitpunkte in Reihenfolge).
- Jede Storyline ist ein horizontaler Balken von Start- bis End-Zeitpunkt in einer eigenen Bahn.
- **Hauptstränge** in den mittleren Bahnen, dicker, kräftige Farbe; Abschnitte als Segmente auf dem Balken. **Nebenstränge** in Bahnen oberhalb und unterhalb, dünner, gedecktere Farbe (FR-008).
- Status durch Farbe/Rahmen **und** Symbol am Balkenanfang (✎ in Bearbeitung, ✓ abgeschlossen, ○ bewusst offen) (FR-002).
- Verbindungen als Kurven zwischen Balken, mit Typ-Symbol und Beschriftung; Warnsymbol bei offenem Hinweis.
- Zoom (Mausrad/Buttons) und Verschieben (Ziehen) (FR-015); „Alles einpassen“-Button.
- Notizen per Schalter in der Karte einblendbar (FR-013).

```
           Kindheit   Tag 1     Tag 2     3 J. später
 Neben      ──── Rivale ○ ─────
 Haupt   ✎ ━━━━━━━ Annas Flucht ━━━━━━━━━━━━━┓
                                              ┃ Zeitsprung
 Haupt              ✓ ━━━━ Der Prozess ━━━━━━┛━━━━━━━
 Neben                          ─── Brief ✎ ───
```

**Bedienung**
- Neue Storyline: Button oder Ziehen über die Zeitachse in einer freien Bahn → Seitenpanel mit Formular.
- Bearbeiten: Klick auf Balken öffnet Seitenpanel (alle Felder, Abschnitte, Art, Status, Löschen).
- Verbindung: Ziehen von einem Anfasser am Balken zu einem anderen Balken → Typ wählen → Hinweise erscheinen sofort.
- Verwaltung von Zeitpunkten und Figuren in eigenen Panels des Buchs.

**Filter (FR-014)**, kombinierbar: nur Hauptstränge · nur bewusst offene · Zeitraum (von/bis Zeitpunkt) · Figuren (eine oder mehrere). Ausgeblendete Storylines werden nicht gezeichnet; Verbindungen zu ihnen werden angedeutet (Stummel).

**Weitere Seiten:** Anmeldung/Registrierung, Bücherliste (anlegen, umbenennen, löschen).

## 9. Technische Leitplanken

- Monorepo mit drei Paketen: `web` (React/Vite), `server` (Fastify), `shared` (Typen, Validierung, Prüflogik).
- PostgreSQL; Schema-Migrationen versioniert.
- REST-API mit JSON; jede Anfrage prüft, dass das Buch dem angemeldeten Nutzer gehört.
- Anmeldung mit E-Mail und Passwort, Session-Cookie (httpOnly). Passwort-Hashing mit einem etablierten Verfahren (argon2 oder bcrypt).
- Speichern: jede Änderung wird direkt per API gespeichert (kein „Speichern“-Button).
- Lokale Entwicklung mit Docker Compose für PostgreSQL.
- Tests: Prüflogik in `shared` vollständig per Unit-Tests abgedeckt (jede Zeile der Tabellen in Abschnitt 7); API-Tests für Kernabläufe und Datentrennung zwischen Nutzern; ein End-to-End-Test für „Storyline anlegen → verbinden → Hinweis sehen“.

**Annahmen zu nicht-funktionalen Anforderungen** (Spec schweigt):
- Flüssige Darstellung bis ca. 200 Storylines pro Buch; darüber muss es funktionieren, darf aber langsamer sein.
- Desktop-Browser (aktuelle Chrome, Firefox, Safari, Edge); Mobilgeräte nicht optimiert.

## 10. Dem Builder überlassen

- Bibliotheken für State-Management, Formulare, Validierung, Datenbankzugriff, Zoom/Pan.
- Genaues Farbschema und Symbole (Vorgaben aus Abschnitt 8 einhalten, Status nicht nur über Farbe).
- Algorithmus zur Bahnenzuordnung (Hauptstränge innen, Nebenstränge außen, Überlappungen vermeiden).
- Verzeichnisstruktur, Linting, Formatierung.
- Deployment-Ziel (für den MVP genügt lokaler Betrieb mit Docker Compose).
