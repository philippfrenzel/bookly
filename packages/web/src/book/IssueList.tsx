/** Renders validation issues returned by local validation or a 422 response. */
import type { ValidationIssue } from '@bookly/shared';

/** Alert list of issue messages under the heading „Das geht so nicht:“. */
export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="issues">
      <p className="error">Das geht so nicht:</p>
      <ul role="alert">
        {issues.map((issue, i) => (
          <li key={`${issue.elementId}-${i}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
