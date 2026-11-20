/** Tabbed side area of the book page; tabs are supplied by the caller so later panels plug in. */
import { useState, type ReactNode } from 'react';

/** One tab of the side area. */
export interface SideTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Renders an optional top block, the tab buttons and the selected tab's content; pass `activeId` to control the selection. */
export function SidePanel({ tabs, activeId, onActiveChange, top }: { tabs: SideTab[]; activeId?: string; onActiveChange?: (id: string) => void; top?: ReactNode }) {
  const [own, setOwn] = useState(tabs[0]?.id);
  const active = activeId ?? own;
  const setActive = (id: string) => {
    setOwn(id);
    onActiveChange?.(id);
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <aside className="side-panel" aria-label="Seitenleiste">
      {top}
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
