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
2. **Leiste an der Markierung und freie Anweisung**: kleine Leiste über markiertem Text, neuer Menüeintrag
   „Eigene Anweisung …“ (Strg+K), neue Server-Aktion für frei formulierte Anweisungen.
3. **@Figuren und Orte, Lektor-Hinweise, Schreibhilfe beim Tippen**: Erwähnungen als KI-Kontext, Unterstreichungen
   für Füllwörter und Wiederholungen, grauer Folgesatz (abschaltbar).

## Tests

- Komponententests tippen in einen `<textarea>`-Stellvertreter (`test/ProseFieldStub.tsx`, in `test/setup.ts` gemockt),
  weil jsdom ein contenteditable nicht verlässlich bearbeitet (Leerzeichen und Markierungen gehen verloren).
- `editor/ProseField.test.tsx` prüft das echte CodeMirror-Feld und den Zauberstab darauf; `editor/wordDiff.test.ts` den Diff.
- E2E (echter Browser) liest Felder mit `e2e/prose.ts` (`expectProse`, `selectProse`).
