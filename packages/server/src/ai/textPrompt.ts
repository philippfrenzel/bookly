/** Builds the AI text request (rephrase, continue, polish, generate, instruct) and parses/normalizes the model reply. */
import { fieldLimit, fitSuggestion, targetRange } from '@bookly/shared';
import type { AiTextAction, AiTextBody } from '@bookly/shared';
import { AiError, type AiRequest } from './client.js';
import type { TextContext } from './textContext.js';

/** Schema name of the text request; the fake client keys off it. */
export const TEXT_SCHEMA_NAME = 'text_suggestions';

const MAX_SUGGESTIONS = 3;

const BASE = `Du hilfst Autorinnen und Autoren beim Schreiben und Überarbeiten von Texten für ihr Buch.
Schreibe auf Deutsch. Behalte Ton, Zeitform, Erzählperspektive und Wortschatz des vorhandenen Textes bei.
Erfinde keine Fakten, die dem Kontext widersprechen.
Der Text klingt natürlich, wie von einem Menschen geschrieben, und der Ton des vorhandenen Textes bleibt erkennbar. Wähle konkrete Formulierungen, die zum Feld und seinem Kontext passen, und variiere den Satzbau, soweit die Länge es zulässt. Vermeide austauschbare Floskeln, unnötige Wiederholungen und schematische KI-Formulierungen.
Zeige Gefühle über konkrete Handlungen und Details aus dem Kontext, statt sie mit allgemeinen Stimmungswörtern zu benennen. Beschreibungen, Notizen und Figurenprofile klingen wie genaue Arbeitsnotizen der Autorin, nicht wie ausgeschmückte Prosa.
Die Länge entspricht etwa der Zielpassage (beim Umformulieren und Verbessern) bzw. umfasst 1–3 Sätze (beim Fortsetzen und Vorschlagen). Titel sind kurz (höchstens etwa 8 Wörter).
Liefere genau 3 deutlich verschiedene Varianten.
Eingabe als JSON: text ist der ganze Feldtext, markierung (falls nicht null) ist die zu bearbeitende Passage, sonst ist der ganze Text das Ziel; kontext dient nur als Hintergrund und wird nie verändert; kontext.erwaehnt enthält die Profile der Figuren, die im Text genannt werden.`;

/** Output rule; only with a selection is the target smaller than the whole field text. */
const OUTPUT_SELECTION =
  'Gib nur den Ersatztext für die markierte Passage aus (beim Fortsetzen nur den neuen Text, der nach markierung eingefügt wird), nicht den ganzen Feldtext, ohne Anführungszeichen, Erklärungen oder Wiederholung des Kontexts.';
const OUTPUT_WHOLE =
  'Gib den neuen Text für den ganzen Feldtext aus (beim Fortsetzen nur den neuen Text, der am Ende von text angehängt wird), ohne Anführungszeichen, Erklärungen oder Wiederholung des Kontexts.';

const ACTION_LINES: Record<AiTextAction, string> = {
  rephrase: 'Aufgabe: Formuliere die Zielpassage mit anderen Worten um und behalte ihre Bedeutung.',
  polish: 'Aufgabe: Verbessere den Stil der Zielpassage; Inhalt, Zeitform und Perspektive bleiben unverändert.',
  continue:
    'Aufgabe: Fortsetzung. Schreibe nur den neuen Text, der an der Einfügestelle (Ende des Textes bzw. der Markierung) anschließt, 1–3 Sätze.',
  generate:
    'Aufgabe: Schreibe den Text des Feldes aus dem Kontext, 1–3 Sätze; bei den Feldern Titel, Name und Beschriftung höchstens etwa 8 Wörter.',
  instruct:
    'Aufgabe: Überarbeite die Zielpassage so, wie es die Anweisung der Autorin (Feld anweisung) verlangt. Was die Anweisung nicht betrifft, bleibt erhalten; die Länge darf sich ändern, wenn die Anweisung es verlangt.',
};

/** Builds the structured-output request for one text action. */
export function textRequest(ctx: TextContext, body: AiTextBody): AiRequest {
  const markierung = body.selection ? body.text.slice(body.selection.start, body.selection.end) : null;
  return {
    system: `${BASE}\n${body.selection ? OUTPUT_SELECTION : OUTPUT_WHOLE}\n${ACTION_LINES[body.action]}`,
    user: JSON.stringify({
      feld: ctx.fieldLabel,
      aktion: body.action,
      ...(body.instruction ? { anweisung: body.instruction } : {}),
      text: body.text,
      markierung,
      kontext: ctx.context,
    }),
    schemaName: TEXT_SCHEMA_NAME,
    timeoutMs: 20_000,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['suggestions'],
      properties: { suggestions: { type: 'array', items: { type: 'string' } } },
    },
  };
}

/**
 * Validates the model reply and normalizes each suggestion so it fits the field; drops empty results and
 * duplicates and keeps at most 3. Throws AiError('invalid_response') on a wrong shape.
 */
export function parseTextSuggestions(raw: unknown, body: AiTextBody): string[] {
  const list = (raw as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) throw new AiError('invalid_response');
  const range = targetRange(body.action, body.text, body.selection);
  const limit = fieldLimit(body.target);
  const fitted = (list as string[]).map((s) => fitSuggestion(s, body.text, range, limit, body.action)).filter((s) => s !== '');
  return [...new Set(fitted)].slice(0, MAX_SUGGESTIONS);
}
