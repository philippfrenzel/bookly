/** Range picker: two selects of time point names (start and end, both inclusive). */
import type { Id, TimePoint, TimeRange } from '@bookly/shared';

interface Props {
  /** Prefix of the accessible names, e.g. „Zeitraum“ gives „Zeitraum Start“ and „Zeitraum Ende“. */
  label: string;
  timePoints: TimePoint[];
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

/** Start and end selects listing the book's time points in order. */
export function RangePicker({ label, timePoints, value, onChange }: Props) {
  const sorted = [...timePoints].sort((a, b) => a.position - b.position);
  const select = (kind: 'Start' | 'Ende', current: Id, set: (id: Id) => void) => (
    <select aria-label={`${label} ${kind}`} value={current} onChange={(e) => set(e.target.value)}>
      {sorted.map((tp) => (
        <option key={tp.id} value={tp.id}>{tp.name}</option>
      ))}
    </select>
  );
  return (
    <span className="range-picker">
      {select('Start', value.startId, (startId) => onChange({ ...value, startId }))}
      {' bis '}
      {select('Ende', value.endId, (endId) => onChange({ ...value, endId }))}
    </span>
  );
}
