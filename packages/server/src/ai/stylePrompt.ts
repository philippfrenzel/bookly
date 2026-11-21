/** Turns a work's style (presets, team styles, own addition) into the instruction text the AI gets (FR-015..017). */
import { STYLE_PRESETS } from '@bookly/shared';
import type { BookStyle, TeamStyle } from '@bookly/shared';

/** The style instruction, or '' when the work has no style set. */
export function styleText(style: BookStyle, teamStyles: TeamStyle[]): string {
  const parts = [
    ...STYLE_PRESETS.filter((p) => style.presetKeys.includes(p.key)).map((p) => `${p.name}: ${p.description}`),
    ...teamStyles.filter((t) => style.teamStyleIds.includes(t.id)).map((t) => `${t.name}: ${t.description}`),
    ...(style.addition ? [`Ergänzung des Autors: ${style.addition}`] : []),
  ];
  return parts.join('\n');
}

/** Prose-quality rule for generated passages (NFR-001): natural, concrete, varied German instead of schematic AI prose. */
export const NATURAL_PROSE = [
  'Der Text klingt natürlich und wie von einem Menschen geschrieben, nicht wie glatt generierte KI-Prosa.',
  'Wähle konkrete Formulierungen, die zu Szene, Figuren und Angaben im Kontext passen (Orte, Gegenstände, Sinneseindrücke, Details aus Inhalt und Szenen),',
  'und lieber eine genaue Beobachtung mit eigenem Rhythmus als eine allgemein gefällige Wendung.',
  'Variiere Satzbau, Satzlänge und Satzanfänge; kurze und lange Sätze dürfen einander abwechseln.',
  'Vermeide Floskeln und Standardwendungen, abgegriffene Bilder und Körperklischees (etwa weiße Knöchel, Kloß im Hals, tanzender Staub im Lichtkegel), unnötige Wiederholungen, ein erklärendes oder moralisierendes Schlussresümee, allgemeine Einstiegssätze und die Gewohnheit, Eigenschaften in Dreierreihen aufzuzählen.',
  'Beende den Text mit einer konkreten Handlung, einem Bild oder einem Satz wörtlicher Rede statt mit einem Satz, der das Geschehen deutet oder zusammenfasst.',
  'Erfinde nichts, was dem Kontext widerspricht, und keine neuen Hauptfiguren oder handlungsentscheidenden Ereignisse; szenische Details, Gesten und Dialoge im Rahmen des Inhalts sind erwünscht.',
].join(' ');

/** Rule for applying the work's "stil" as a recognisable voice; only added to a prompt when a style is set. */
export const STYLE_VOICE = [
  'Setze den "stil" als erkennbare Erzählstimme um, nicht als Schlagwort: über Satzlänge, Rhythmus, Bildsprache, Erzählabstand und die Art der Dialoge, nicht indem du Stilbegriffe nennst.',
  'Besteht der "stil" aus mehreren Einträgen, werden sie kombiniert; die "Ergänzung des Autors" verfeinert sie.',
  'Widerspricht der "stil" der "anweisung" des Autors, hat die "anweisung" Vorrang.',
  'Der "stil" und der Ton des vorherigen Textes gehen den allgemeinen Abwechslungsregeln vor.',
].join(' ');
