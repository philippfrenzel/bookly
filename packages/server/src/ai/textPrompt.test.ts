/** Tests for the AI text prompt builder and reply parser (no database, no network). */
import { describe, expect, it } from 'vitest';
import type { AiTextBody } from '@bookly/shared';
import { AiError } from './client.js';
import { TEXT_SCHEMA_NAME, parseTextSuggestions, textRequest } from './textPrompt.js';
import type { TextContext } from './textContext.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ctx: TextContext = { fieldLabel: 'Kurzbeschreibung', context: { buch: 'B' }, hasText: true };
const body = (over: Partial<AiTextBody>): AiTextBody => ({
  target: { kind: 'storyline', storylineId: ID, field: 'description' },
  action: 'rephrase',
  text: 'Der Held reist nach Norden.',
  selection: null,
  draft: {},
  ...over,
});

describe('textRequest', () => {
  it('uses the text schema and a 20s timeout', () => {
    const req = textRequest(ctx, body({}));
    expect(req.schemaName).toBe(TEXT_SCHEMA_NAME);
    expect(TEXT_SCHEMA_NAME).toBe('text_suggestions');
    expect(req.timeoutMs).toBe(20_000);
  });

  it('describes continuing in the system prompt', () => {
    expect(textRequest(ctx, body({ action: 'continue' })).system).toContain('Fortsetz');
  });

  it('explains the input fields in the system prompt', () => {
    const { system } = textRequest(ctx, body({}));
    expect(system).toContain('markierung');
    expect(system).toContain('kontext');
  });

  it('sends the selected substring as markierung, or null', () => {
    const sel = JSON.parse(textRequest(ctx, body({ selection: { start: 4, end: 8 } })).user);
    expect(sel.markierung).toBe('Held');
    expect(sel.feld).toBe('Kurzbeschreibung');
    expect(sel.aktion).toBe('rephrase');
    expect(sel.kontext).toEqual({ buch: 'B' });
    expect(JSON.parse(textRequest(ctx, body({})).user).markierung).toBeNull();
  });
});

describe('parseTextSuggestions', () => {
  it('trims, drops empty and duplicate entries and keeps three', () => {
    expect(parseTextSuggestions({ suggestions: [' a ', 'a', '', 'b', 'c', 'd'] }, body({}))).toEqual(['a', 'b', 'c']);
  });

  it('throws AiError on a wrong shape', () => {
    expect(() => parseTextSuggestions({ text: 'x' }, body({}))).toThrow(AiError);
  });

  it('flattens line breaks for single-line fields', () => {
    const b = body({ target: { kind: 'storyline', storylineId: ID, field: 'title' }, text: 'Alt' });
    expect(parseTextSuggestions({ suggestions: ['Zeile\nzwei'] }, b)).toEqual(['Zeile zwei']);
  });
});
