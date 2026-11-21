# Textfelder mit CodeMirror 6

Stand 2026-11-21. Auftraggeber: Pepe. Prototyp: https://claude.ai/artifact/ERKkiiEFozgi2RtwxUrmRs

## Absicht

Alle mehrzeiligen Textfelder laufen über CodeMirror 6, damit die KI ihre Vorschläge **neben** dem Text zeigen kann,
statt ihn sofort zu überschreiben. Der Zauberstab bleibt, wie er ist; CodeMirror erweitert ihn, ersetzt ihn nicht.

Entschieden von Pepe:
- Flächendeckend: jedes `<textarea>` wird ein `ProseField`. Einzeilige Felder (Namen, Titel) bleiben `<input>`.
- Formatierung (fett, kursiv) ist derzeit nicht nötig. Darum CodeMirror (reiner Text, gleiches Datenmodell) statt TipTap.

## Umsetzung in drei Schritten

1. **Gemeinsames Feld und Änderungsansicht** (dieser Schritt)
   - `packages/web/src/editor/ProseField.tsx`: CodeMirror-Feld mit den Props eines Textfelds (`value`/`defaultValue`,
     `onChange(text)`, `onBlur(text)`, `onSelect(start, end)`, `ariaLabel`, `placeholder`, `maxLength`, `readOnly`, `rows`).
     Der Ref liefert einen textarea-ähnlichen Griff (`value`, `selectionStart`, `selectionEnd`, `focus`) plus Vorschlags-Steuerung.
   - `editor/suggestion.ts`: Vorschlag als Overlay. Gestrichenes als `<del>`, Neues als `<ins>`, Wortdiff aus `editor/wordDiff.ts`.
     `Tab` übernimmt (ein Rückgängig-Schritt), `Esc` verwirft, `Alt+←/→` blättert, jede Eingabe verwirft.
   - `MagicWand`: auf einem `ProseField` geht der Vorschlag ins Overlay; die Leiste zeigt ◀ n/m ▶, „Verwerfen“ und „Übernehmen“.
     Auf einem `<input>` bleibt das bisherige Verhalten (direkt einsetzen, ↶ stellt wieder her).
   - Verlassen des Felds übernimmt nichts: gespeichert wird nur, was übernommen wurde.
2. **Leiste an der Markierung und freie Anweisung** (umgesetzt)
   - Neue Aktion `instruct` mit Feld `instruction` (höchstens 300 Zeichen, nur bei `instruct`, dort Pflicht).
     Der Prompt bekommt `anweisung`; die Zielpassage ist wie beim Umformulieren die Markierung oder der ganze Text.
   - Zauberstab-Menü: „Eigene Anweisung …“ öffnet ein Eingabefeld mit Beispielen (spannender, kürzer, mehr Dialog);
     funktioniert in allen Feldern, auch einzeiligen.
   - `editor/selectionTools.ts`: Leiste über markiertem Text (mind. 3 Zeichen) mit Umformulieren, Stil verbessern,
     Anweisung …; Strg+K öffnet die Anweisung für die Markierung oder den Absatz am Cursor. Die Leiste erscheint nur,
     wenn ein Zauberstab am Feld hängt und KI eingerichtet ist (`ProseHandle.setAssist`), und tritt zurück, solange ein
     Vorschlag angezeigt wird. Tooltips hängen an `<body>`, damit schmale Panels sie nicht abschneiden.
3. **@Figuren, Lektor-Hinweise, Schreibhilfe beim Tippen** (umgesetzt)
   - `editor/mentions.ts`: „@“ bietet die Figuren des Buchs an (`MentionNamesProvider` auf der Buchseite), eingefügt
     wird der reine Name; bekannte Namen sind eingefärbt. Orte gibt es im Datenmodell noch nicht. Im Manuskript
     kommen die Namen aus `ManuscriptResponse.context.characters` (auch für Lektoren).
   - Server (`ai/mentions.ts`): Figuren, die im Text namentlich vorkommen und nicht schon im Kontext stehen, gehen als
     `kontext.erwaehnt` (Profil: Beschreibung, Verhalten, Absichten, höchstens 8) an die KI. Ganzwort-Treffer, ohne „@“.
   - `editor/hints.ts`: Wellenlinie unter Füllwörtern (eigentlich, plötzlich, irgendwie, …) und unter Substantiven, die
     innerhalb von 25 Wörtern wiederkehren (Satzanfänge und Figurennamen ausgenommen). Lokal, ohne KI. Beim Überfahren
     die Begründung und, mit Zauberstab, „Satz umformulieren lassen“.
   - `editor/ghost.ts`: nach 1,1 s Tipp-Pause am Textende fragt das Feld den Zauberstab leise nach „Fortsetzen“ und zeigt
     die Antwort grau. Tab übernimmt, Strg/Cmd+→ ein Wort, Esc oder Weitertippen verwirft.
   - Schalter im Zauberstab-Menü (nur bei mehrzeiligen Feldern): „Lektor-Hinweise“ (Standard an) und „Schreibhilfe beim
     Tippen“ (Standard aus, weil jede Pause eine KI-Anfrage kostet). Gemerkt pro Browser (`editor/preferences.ts`).

## Manuskript

Die Bausteine im Manuskript haben „Text“ und „Inhalt (Plan)“ mit Zauberstab, also auch die Leiste an der Markierung,
die Schreibhilfe und die Schalter. Die Anfragen gehen an `POST /api/books/:bookId/manuscript/blocks/:blockId/ai-text`
(Ziel `manuscriptBlock`), offen für alle mit dem Recht „bearbeiten“, also auch Lektoren. Kontext: Kapitel, Titel und
Plan des Bausteins, Anweisung, Stil des Werks, Ende des vorigen und Anfang des nächsten Bausteins, erwähnte Figuren.
„Fortsetzen“ auf langen Bausteinen schickt nur die letzten 4000 Zeichen. Der Vorschlagsmodus der Lektoren bleibt ohne Zauberstab.

## Tests

- Komponententests tippen in einen `<textarea>`-Stellvertreter (`test/ProseFieldStub.tsx`, in `test/setup.ts` gemockt),
  weil jsdom ein contenteditable nicht verlässlich bearbeitet (Leerzeichen und Markierungen gehen verloren).
- `editor/ProseField.test.tsx` prüft das echte CodeMirror-Feld und den Zauberstab darauf; `editor/wordDiff.test.ts` den Diff.
- E2E (echter Browser) liest Felder mit `e2e/prose.ts` (`expectProse`, `selectProse`).
