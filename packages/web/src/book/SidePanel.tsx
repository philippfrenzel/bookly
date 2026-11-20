/** Tabbed side area of the book page; tabs are supplied by the caller so later panels plug in. */
import { useState, type ReactNode } from 'react';

/** One tab of the side area. */
export interface SideTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Renders tab buttons and the content of the selected tab; pass `activeId` to control the selection. */
export function SidePanel({ tabs, activeId, onActiveChange }: { tabs: SideTab[]; activeId?: string; onActiveChange?: (id: string) => void }) {
  const [own, setOwn] = useState(tabs[0]?.id);
  const active = activeId ?? own;
  const setActive = (id: string) => {
    setOwn(id);
    onActiveChange?.(id);
  };
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
