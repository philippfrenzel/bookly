/** Finds the characters a text names, so the AI gets their profiles as context ("@Figuren" in the editor). */
import type { Character } from '@bookly/shared';

/** At most this many mentioned characters are added to a request. */
export const MAX_MENTIONED = 8;

/** Escapes `s` for use inside a RegExp. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Characters of `characters` whose name occurs in `text` as a whole word (case-sensitive, an optional leading "@"
 * is fine), minus those whose name is in `exclude` (already in the context). Order of first occurrence in the text.
 */
export function mentionedCharacters(
  characters: Character[],
  text: string,
  exclude: string[] = [],
): { name: string; beschreibung: string; verhalten: string; absichten: string }[] {
  const skip = new Set(exclude);
  return characters
    .filter((c): c is Character & { name: string } => !!c.name && c.name.trim().length >= 2 && !skip.has(c.name))
    .map((c) => ({ c, at: text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escape(c.name.trim())}(?![\\p{L}\\p{N}])`, 'u')) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_MENTIONED)
    .map(({ c }) => ({ name: c.name, beschreibung: c.description ?? '', verhalten: c.behavior ?? '', absichten: c.intentions ?? '' }));
}

/** Names of the characters a request context already lists (top-level and section "figuren"). */
function listedNames(context: Record<string, unknown>): string[] {
  const lists = [context.figuren, (context.abschnitt as { figuren?: unknown } | undefined)?.figuren];
  return lists.flatMap((l) => (Array.isArray(l) ? l.map((f) => (f as { name?: unknown }).name).filter((n): n is string => typeof n === 'string') : []));
}

/** `ctx` with `kontext.erwaehnt` added: profiles of characters `text` names that the context does not list yet. */
export function withMentions<T extends { context: Record<string, unknown> }>(ctx: T, characters: Character[], text: string): T {
  const erwaehnt = mentionedCharacters(characters, text, listedNames(ctx.context));
  return erwaehnt.length === 0 ? ctx : { ...ctx, context: { ...ctx.context, erwaehnt } };
}
