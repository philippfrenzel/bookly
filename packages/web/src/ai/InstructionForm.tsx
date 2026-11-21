/** Small form for a free instruction to the AI ("Eigene Anweisung"), with a few ready-made examples. */
import { useEffect, useId, useRef, useState } from 'react';
import { MAX_INSTRUCTION } from '@bookly/shared';
import { INSTRUCTION_EXAMPLES } from '../editor/selectionTools';

export interface InstructionFormProps {
  /** Sends the trimmed instruction. */
  onSubmit: (instruction: string) => void;
  /** Closes the form without sending (Escape). */
  onCancel: () => void;
}

/** Text input plus "Los" button; Enter sends, Escape cancels. Focuses the input when shown. */
export function InstructionForm({ onSubmit, onCancel }: InstructionFormProps): JSX.Element {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  useEffect(() => input.current?.focus(), []);
  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  };
  return (
    <form
      className="instruction-form"
      onSubmit={(e) => {
        e.preventDefault();
        send(value);
      }}
    >
      <div className="instruction-row">
        <input
          ref={input}
          aria-label="Anweisung an die KI"
          aria-describedby={hintId}
          placeholder="Was soll die KI tun?"
          maxLength={MAX_INSTRUCTION}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
        />
        <button type="submit" className="primary" disabled={value.trim() === ''}>Los</button>
      </div>
      <div className="instruction-chips" id={hintId}>
        {INSTRUCTION_EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => send(ex)}>{ex}</button>
        ))}
      </div>
    </form>
  );
}
