/** Tests for the polling rule of useBook. */
import { describe, expect, it } from 'vitest';
import type { CharacterCheck } from '@bookly/shared';
import { checksRefetchInterval } from './hooks';

const check = (status: CharacterCheck['status']) => ({ status }) as CharacterCheck;
const data = (...statuses: CharacterCheck['status'][]) => ({ state: { data: { characterChecks: statuses.map(check) } } });

describe('checksRefetchInterval', () => {
  it('polls every 2 s while a check is pending', () => expect(checksRefetchInterval(data('done', 'pending'))).toBe(2000));
  it('polls every 2 s while a check is running', () => expect(checksRefetchInterval(data('running'))).toBe(2000));
  it('stops when all checks are settled', () => expect(checksRefetchInterval(data('done', 'failed'))).toBe(false));
  it('does not poll without data', () => expect(checksRefetchInterval({ state: { data: undefined } })).toBe(false));
});
