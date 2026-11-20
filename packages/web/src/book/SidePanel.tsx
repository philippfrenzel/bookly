/** Tabbed side area of the book page; tabs are supplied by the caller so later panels plug in. */
import { useState, type ReactNode } from 'react';

/** One tab of the side area. */
export interface SideTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Renders tab buttons and the content of the selected tab. */
export function SidePanel({ tabs }: { tabs: SideTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <aside className="side-panel" aria-label="Seitenleiste">
      <div role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </aside>
  );
}
