/**
 * Manual quality evaluation (NFR-001): sends synthetic Baustein drafts for every built-in style, two custom styles and a
 * no-style baseline, plus two text-field wand actions, through the configured OpenRouter gateway using the app's own
 * request builders. Only synthetic data is sent. Writes raw results as JSON to the given output directory.
 *
 * Usage: npx tsx --env-file=<path to .env with OPENROUTER_API_KEY/OPENROUTER_MODEL> scripts/evalStyles.ts <outDir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_PRESETS } from '@bookly/shared';
import type { AiTextBody, TeamStyle } from '@bookly/shared';
import { createOpenRouterClient, type AiRequest } from '../src/ai/client.js';
import { draftRequest, type DraftContext } from '../src/ai/structurePrompt.js';
import { styleText } from '../src/ai/stylePrompt.js';
import { parseTextSuggestions, textRequest } from '../src/ai/textPrompt.js';

/** Synthetic Bausteine; invented for this evaluation, no author data. */
const CONTEXTS: Record<string, Omit<DraftContext, 'style'>> = {
  faehre: {
    bookTitle: 'Die letzte Fähre',
    chapterTitle: 'Nebel über dem Sund',
    title: 'Abschied am Anleger',
    synopsis: 'Mara bringt ihren Bruder Jonas zur letzten Fähre des Tages. Sie streiten kurz über das verkaufte Elternhaus; erst als die Fähre ablegt, ruft sie ihm etwas nach.',
    source: { title: 'Abschied', description: 'Mara und Jonas trennen sich im Streit, bevor Jonas für Monate aufs Festland zieht.' },
    characters: [
      { name: 'Mara', description: 'Mitte dreißig, Fischräucherin, bleibt auf der Insel, spricht wenig über Gefühle.' },
      { name: 'Jonas', description: 'Jüngerer Bruder, Ingenieur, will weg, hat das Elternhaus verkauft.' },
    ],
    scenes: [{ name: 'Fähranleger', description: 'Betonmole mit rostigem Geländer, Möwen, Dieselgeruch, im Herbst früh dunkel.' }],
    previousText: 'Der Wind hatte am Nachmittag gedreht. Mara spürte es an den Händen, bevor sie es auf dem Wasser sah.',
  },
  werkstatt: {
    bookTitle: 'Das Uhrwerk',
    chapterTitle: 'Erster Winter',
    title: 'Lio findet den Brief',
    synopsis: 'Die vierzehnjährige Lio räumt die Werkstatt ihres verstorbenen Großvaters aus und findet in einer Taschenuhr einen gefalteten Brief an eine Frau, deren Namen sie nie gehört hat.',
    source: { title: 'Nachlass', description: 'Lio entdeckt, dass ihr Großvater ein Geheimnis hatte.' },
    characters: [{ name: 'Lio', description: 'Vierzehn, neugierig, trauert still, war oft beim Großvater in der Werkstatt.' }],
    scenes: [{ name: 'Uhrmacherwerkstatt', description: 'Enger Raum über einer Bäckerei, Lupenlampen, Schubladen mit Zahnrädern, Geruch nach Öl und Messing.' }],
    previousText: '',
  },
};

/** Two synthetic custom styles, as an author would define them (team base style and/or own addition). */
const TEAM: TeamStyle[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Hausstil Küste', description: 'Präsens, nah an der Figur, wenig Dialog, Wetter und Arbeit tragen die Stimmung.' },
];

const STYLES: { key: string; label: string; style: string }[] = [
  ...STYLE_PRESETS.map((p) => ({ key: p.key, label: p.name, style: styleText({ presetKeys: [p.key], teamStyleIds: [], addition: '' }, []) })),
  { key: 'team', label: 'Team-Stil „Hausstil Küste“', style: styleText({ presetKeys: [], teamStyleIds: [TEAM[0]!.id], addition: '' }, TEAM) },
  {
    key: 'kombi',
    label: 'Kombination: Modern und knapp + Ergänzung des Autors',
    style: styleText({ presetKeys: ['knapp'], teamStyleIds: [], addition: 'Warm und persönlich, mit trockenem Humor; Dialoge in Umgangssprache.' }, []),
  },
  { key: 'ohne', label: 'Kein Stil gesetzt', style: '' },
];

/** Runs tasks with a small concurrency limit. */
async function pool<T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await items[i]!();
    }
  }));
  return out;
}

async function main(): Promise<void> {
  const outDir = process.argv[2];
  const { OPENROUTER_API_KEY: apiKey, OPENROUTER_MODEL: model } = process.env;
  if (!outDir) throw new Error('usage: evalStyles.ts <outDir>');
  if (!apiKey || !model) throw new Error('OPENROUTER_API_KEY and OPENROUTER_MODEL must be set');
  mkdirSync(outDir, { recursive: true });
  const ai = createOpenRouterClient({ apiKey, model });
  const run = async (req: AiRequest): Promise<{ ok: true; raw: unknown; ms: number } | { ok: false; error: string; ms: number }> => {
    const t = Date.now();
    try {
      return { ok: true, raw: await ai.complete(req), ms: Date.now() - t };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t };
    }
  };

  const draftJobs = Object.entries(CONTEXTS).flatMap(([ctxKey, ctx]) =>
    STYLES.map((s) => async () => {
      const req = draftRequest({ ...ctx, ...(s.style && { style: s.style }) });
      return { kind: 'draft', context: ctxKey, style: s.key, label: s.label, system: req.system, result: await run(req) };
    }),
  );

  const fieldText = 'Mara bringt Jonas zur Fähre. Sie streiten über das Haus. Dann fährt er weg und sie ist traurig.';
  const textCtx = {
    hasText: true,
    fieldLabel: 'Beschreibung des Abschnitts',
    context: { storyline: { titel: 'Mara bleibt', beschreibung: 'Mara hält auf der Insel aus, während alle gehen.' }, abschnitt: { titel: 'Abschied' } },
  };
  const textJobs = (['polish', 'generate'] as const).map((action) => async () => {
    const body: AiTextBody = {
      target: { kind: 'section', storylineId: '00000000-0000-4000-8000-000000000002', sectionId: null, field: 'description' },
      action,
      text: action === 'generate' ? '' : fieldText,
      selection: null,
      draft: {},
    };
    const req = textRequest(textCtx, body);
    const result = await run(req);
    const suggestions = result.ok ? parseTextSuggestions(result.raw, body) : [];
    return { kind: 'text', action, input: body.text, result, suggestions };
  });

  const jobs: (() => Promise<{ kind: string; result: { ok: boolean } }>)[] = [...draftJobs, ...textJobs];
  const results = await pool(jobs, 4);
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ model, date: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.result.ok).length;
  console.log(`model=${model} calls=${results.length} failed=${failed} out=${join(outDir, 'results.json')}`);
}

await main();
