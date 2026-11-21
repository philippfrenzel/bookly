import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { replaceRange } from './replaceRange';

function Field() {
  const [v, setV] = useState('Mira ging weg');
  return (
    <>
      <textarea aria-label="f" value={v} onChange={(e) => setV(e.target.value)} />
      <output data-testid="state">{v}</output>
    </>
  );
}

describe('replaceRange', () => {
  it('replaces the range, updates React state and selects the insertion', () => {
    render(<Field />);
    const el = screen.getByLabelText('f') as HTMLTextAreaElement;
    act(() => replaceRange(el, 5, 9, 'neu'));
    expect(el.value).toBe('Mira neu weg');
    expect(screen.getByTestId('state')).toHaveTextContent('Mira neu weg');
    expect(el.selectionStart).toBe(5);
    expect(el.selectionEnd).toBe(8);
  });
});
