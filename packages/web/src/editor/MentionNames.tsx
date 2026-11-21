/**
 * Names that ProseFields offer after "@" and highlight in the text (the book's characters).
 * Provided once per page; fields outside a provider simply get no mentions.
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

const NONE: readonly string[] = [];
const MentionNamesContext = createContext<readonly string[]>(NONE);

/** Makes `names` (e.g. the book's character names) available to every ProseField below. */
export function MentionNamesProvider({ names, children }: { names: readonly string[]; children: ReactNode }): JSX.Element {
  const key = names.join('\u0000');
  // Stable while the names stay the same, so fields do not reconfigure on every book refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => names.map((n) => n.trim()).filter((n) => n.length >= 2), [key]);
  return <MentionNamesContext.Provider value={value}>{children}</MentionNamesContext.Provider>;
}

/** The names provided for the current page (empty outside a provider). */
export function useMentionNames(): readonly string[] {
  return useContext(MentionNamesContext);
}
