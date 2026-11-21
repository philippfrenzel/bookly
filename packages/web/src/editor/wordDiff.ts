/** Word-level diff between a text and an AI suggestion, grouped so each change reads as one unit. */

/** One piece of a diff: text both versions share, text only the old one has, or text only the new one has. */
export interface DiffOp {
  type: 'eq' | 'del' | 'ins';
  text: string;
}

/** Splits text into words, whitespace runs and single punctuation marks. */
function tokenize(s: string): string[] {
  return s.match(/[\p{L}\p{N}]+|\s+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Longest-common-subsequence diff on tokens; consecutive ops of one type are merged. */
function rawDiff(a: string, b: string): DiffOp[] {
  const x = tokenize(a);
  const y = tokenize(b);
  const n = x.length;
  const m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = x[i] === y[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('eq', x[i]!);
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) push('del', x[i++]!);
    else push('ins', y[j++]!);
  }
  while (i < n) push('del', x[i++]!);
  while (j < m) push('ins', y[j++]!);
  return ops;
}

/**
 * Diff of `a` (current text) to `b` (suggestion). Short shared runs between two changes
 * (a space, "an", a comma) are folded into the change, and every change block is given as all
 * deleted text followed by all inserted text, so "Sie dachte an" → "Ihre Gedanken wanderten zu"
 * shows as one struck phrase and one new phrase instead of a word salad.
 * Joining the `eq` and `del` texts gives `a`; joining `eq` and `ins` gives `b`.
 */
export function wordDiff(a: string, b: string): DiffOp[] {
  const ops = rawDiff(a, b);
  const out: DiffOp[] = [];
  let block: { del: string; ins: string } | null = null;
  const flush = () => {
    if (!block) return;
    if (block.del) out.push({ type: 'del', text: block.del });
    if (block.ins) out.push({ type: 'ins', text: block.ins });
    block = null;
  };
  ops.forEach((op, k) => {
    const between = k < ops.length - 1 && ops[k + 1]!.type !== 'eq';
    if (op.type === 'eq' && !(block && between && op.text.trim().length <= 3)) {
      flush();
      out.push(op);
      return;
    }
    block ??= { del: '', ins: '' };
    if (op.type === 'eq') {
      block.del += op.text;
      block.ins += op.text;
    } else block[op.type] += op.text;
  });
  flush();
  return out;
}
