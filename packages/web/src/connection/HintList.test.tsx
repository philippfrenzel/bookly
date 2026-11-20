/** Tests for the hint list: empty state, muted acknowledged hints and the acknowledge buttons. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Hint } from '@bookly/shared';
import { describe, expect, it, vi } from 'vitest';
import { HintList } from './HintList';

const open: Hint = { connectionId: 'k1', rule: 'time_jump_order', characterId: null, message: 'Offen', acknowledged: false };
const done: Hint = { connectionId: 'k1', rule: 'character_overlap', characterId: 'c1', message: 'Quittiert', acknowledged: true };

describe('HintList', () => {
  it('shows the empty state', () => {
    render(<HintList hints={[]} />);
    expect(screen.getByRole('heading', { name: 'Hinweise' })).toBeInTheDocument();
    expect(screen.getByText('Keine Widersprüche gefunden.')).toBeInTheDocument();
  });

  it('offers no buttons without handlers (draft mode)', () => {
    render(<HintList hints={[open]} />);
    expect(screen.getByText('Offen')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('acknowledges and reopens through the handlers', async () => {
    const onAcknowledge = vi.fn();
    const onReopen = vi.fn();
    render(<HintList hints={[open, done]} onAcknowledge={onAcknowledge} onReopen={onReopen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bewusst so' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wieder anzeigen' }));
    expect(onAcknowledge).toHaveBeenCalledWith(open);
    expect(onReopen).toHaveBeenCalledWith(done);
  });
});
