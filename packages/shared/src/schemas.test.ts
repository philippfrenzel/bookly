/** Tests for the request body schemas. */
import { describe, expect, it } from 'vitest';
import { BookPatchBody, AdditionBody, CharacterBody, RegisterBody, StorylineCreateBody, StorylinePatchBody } from './schemas.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const base = { title: ' T ', range: { startId: A, endId: B }, kind: 'main' };

describe('schemas', () => {
  it('fills storyline defaults and trims', () => {
    const r = StorylineCreateBody.parse(base);
    expect(r).toMatchObject({ title: 'T', status: 'in_progress', characterIds: [], description: '', note: null });
    expect(r.color).toBeUndefined();
  });
  it('rejects bad kind and color', () => {
    expect(() => StorylineCreateBody.parse({ ...base, kind: 'x' })).toThrow();
    expect(() => StorylineCreateBody.parse({ ...base, color: 'red' })).toThrow();
  });
  it('allows empty patch without filling defaults', () => {
    expect(StorylinePatchBody.parse({})).toEqual({});
  });
  it('validates register', () => {
    expect(() => RegisterBody.parse({ email: 'a@b.de', password: '1234567', displayName: 'x' })).toThrow();
    expect(RegisterBody.parse({ email: ' A@B.de ', password: '12345678', displayName: 'x' }).email).toBe('a@b.de');
  });
});

describe('CharacterBody', () => {
  it('accepts an empty body', () => expect(CharacterBody.parse({})).toEqual({}));
  it('turns blank strings into null', () => expect(CharacterBody.parse({ name: '  ' })).toEqual({ name: null }));
  it('rejects over-long fields', () => {
    expect(() => CharacterBody.parse({ description: 'x'.repeat(2001) })).toThrow();
    expect(() => CharacterBody.parse({ name: 'x'.repeat(201) })).toThrow();
  });
});

describe('AdditionBody', () => {
  it('accepts partial input', () => expect(AdditionBody.parse({ behavior: 'x' })).toEqual({ behavior: 'x' }));
});

describe('BookPatchBody', () => {
  it('accepts a title or a target range (or null) and rejects nothing', () => {
    expect(BookPatchBody.safeParse({ title: 'Neu' }).success).toBe(true);
    expect(BookPatchBody.safeParse({ targetWords: null }).success).toBe(true);
    expect(BookPatchBody.safeParse({ targetWords: { min: 1, max: 2 } }).success).toBe(true);
    expect(BookPatchBody.safeParse({}).success).toBe(false);
  });
});
