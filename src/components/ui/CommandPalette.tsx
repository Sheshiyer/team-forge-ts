import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CommandItem {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 80;
  let score = 0;
  let qi = 0;
  let lastMatchIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatchIndex === ti - 1 ? 10 : 5;
      lastMatchIndex = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export default function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .filter((item) => fuzzyMatch(query, item.label) || fuzzyMatch(query, item.section))
      .sort((a, b) => fuzzyScore(query, b.label) - fuzzyScore(query, a.label));
  }, [query, items]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback(
    (index: number) => {
      const item = filtered[index];
      if (item) {
        onClose();
        item.action();
      }
    },
    [filtered, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          execute(selectedIndex);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered.length, selectedIndex, execute, onClose],
  );

  if (!open) return null;

  // Group by section
  const sections = new Map<string, typeof filtered>();
  for (const item of filtered) {
    const group = sections.get(item.section) ?? [];
    group.push(item);
    sections.set(item.section, group);
  }

  let globalIndex = 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div style={styles.inputWrap}>
          <span style={styles.inputIcon}>⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            style={styles.input}
            autoFocus
          />
          <span style={styles.escHint}>ESC</span>
        </div>
        <div style={styles.divider} />
        <div ref={listRef} style={styles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>NO MATCHING COMMANDS</div>
          ) : (
            Array.from(sections.entries()).map(([section, sectionItems]) => (
              <div key={section}>
                <div style={styles.sectionLabel}>{section}</div>
                {sectionItems.map((item) => {
                  const thisIndex = globalIndex++;
                  const isSelected = thisIndex === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      style={{
                        ...styles.item,
                        ...(isSelected ? styles.itemSelected : {}),
                      }}
                      onClick={() => execute(thisIndex)}
                      onMouseEnter={() => setSelectedIndex(thisIndex)}
                    >
                      {item.icon ? <span style={styles.itemIcon}>{item.icon}</span> : null}
                      <span style={styles.itemLabel}>{item.label}</span>
                      {item.shortcut ? <span style={styles.shortcut}>{item.shortcut}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div style={styles.footer}>
          <span>↑↓ NAVIGATE</span>
          <span>↵ SELECT</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "15vh",
    backdropFilter: "blur(2px)",
  },
  container: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "var(--lcars-bg, #1a1a2e)",
    border: "1px solid var(--lcars-orange)",
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
  },
  inputIcon: {
    color: "var(--lcars-orange)",
    fontSize: 16,
    fontWeight: 700,
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--lcars-text, #f0e0c0)",
    fontSize: 15,
    fontFamily: "'Orbitron', monospace",
    letterSpacing: "0.5px",
  },
  escHint: {
    color: "var(--lcars-tan, #998877)",
    fontSize: 10,
    letterSpacing: "1px",
    border: "1px solid var(--lcars-tan, #998877)",
    padding: "2px 6px",
    borderRadius: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "var(--lcars-orange)",
    opacity: 0.4,
  },
  list: {
    maxHeight: 360,
    overflowY: "auto",
    padding: "8px 0",
  },
  sectionLabel: {
    padding: "8px 16px 4px",
    fontSize: 9,
    letterSpacing: "1.5px",
    color: "var(--lcars-tan, #998877)",
    fontFamily: "'Orbitron', sans-serif",
    textTransform: "uppercase",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    cursor: "pointer",
    transition: "background-color 0.1s",
  },
  itemSelected: {
    backgroundColor: "rgba(255, 153, 0, 0.15)",
    borderLeft: "3px solid var(--lcars-orange)",
    paddingLeft: 13,
  },
  itemIcon: {
    fontSize: 14,
    width: 20,
    textAlign: "center" as const,
  },
  itemLabel: {
    flex: 1,
    color: "var(--lcars-text, #f0e0c0)",
    fontSize: 13,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: "0.5px",
  },
  shortcut: {
    color: "var(--lcars-tan, #998877)",
    fontSize: 10,
    letterSpacing: "1px",
    border: "1px solid var(--lcars-tan, #998877)",
    padding: "2px 6px",
    borderRadius: 3,
  },
  empty: {
    padding: "24px 16px",
    textAlign: "center" as const,
    color: "var(--lcars-tan, #998877)",
    fontSize: 11,
    letterSpacing: "1px",
    fontFamily: "'Orbitron', sans-serif",
  },
  footer: {
    display: "flex",
    gap: 16,
    justifyContent: "center",
    padding: "10px 16px",
    borderTop: "1px solid rgba(255,153,0,0.2)",
    fontSize: 9,
    letterSpacing: "1px",
    color: "var(--lcars-tan, #998877)",
    fontFamily: "'Orbitron', sans-serif",
  },
};
