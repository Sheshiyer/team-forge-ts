import type { CortexLensDefinition } from "../../lib/commandCortex/lensTypes";
import type { CortexLensId } from "../../lib/commandCortex/types";

export interface LensRailProps {
  lenses: CortexLensDefinition[];
  activeLens: CortexLensId;
  onSelectLens?: (lensId: CortexLensId) => void;
}

function LensGlyph({ lensId }: { lensId: CortexLensId }) {
  switch (lensId) {
    case "mission":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <circle r={13} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <circle r={5} fill="currentColor" />
          <path d="M -10 0 H 10 M 0 -10 V 10" stroke="currentColor" strokeWidth={1.2} />
        </svg>
      );
    case "agents":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <path d="M 0 -14 L 12 -6 L 12 8 L 0 14 L -12 8 L -12 -6 Z" fill="none" stroke="currentColor" strokeWidth={1.2} />
          <circle r={3} fill="currentColor" />
          <line x1={0} y1={-6} x2={0} y2={6} stroke="currentColor" strokeWidth={1.1} />
        </svg>
      );
    case "work":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <path d="M 0 -14 L 14 0 L 0 14 L -14 0 Z" fill="none" stroke="currentColor" strokeWidth={1.2} />
          <path d="M 0 -6 V 4 M 0 4 L -5 9 M 0 4 L 5 9" stroke="currentColor" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        </svg>
      );
    case "clients":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <circle r={13} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <circle r={8} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.6} />
          <circle r={3} fill="currentColor" />
        </svg>
      );
    case "risk":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <path d="M 0 -14 L 11 -9 L 11 6 L 0 13 L -11 6 L -11 -9 Z" fill="none" stroke="currentColor" strokeWidth={1.2} />
          <line x1={0} y1={-6} x2={0} y2={4} stroke="currentColor" strokeWidth={1.4} />
          <circle cx={0} cy={8} r={1.4} fill="currentColor" />
        </svg>
      );
    case "signals":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <path d="M -14 0 Q -7 -10 0 0 T 14 0" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={-14} cy={0} r={1.6} fill="currentColor" />
          <circle cx={14} cy={0} r={1.6} fill="currentColor" />
        </svg>
      );
    case "memory":
      return (
        <svg viewBox="-20 -20 40 40" width={18} height={18} aria-hidden="true">
          <ellipse rx={13} ry={8} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <ellipse rx={9} ry={5.4} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.7} />
          <ellipse rx={5} ry={3} fill="currentColor" opacity={0.85} />
        </svg>
      );
    default:
      return <span aria-hidden="true">•</span>;
  }
}

export default function LensRail({ lenses, activeLens, onSelectLens }: LensRailProps) {
  return (
    <nav className="cortex-lens-rail" aria-label="Command Cortex lenses">
      {lenses.map((lens, idx) => {
        const isActive = lens.id === activeLens;
        return (
          <button
            key={lens.id}
            type="button"
            className={isActive ? "is-active" : undefined}
            title={`${lens.legacyPages.join(", ")} · ⌘${idx + 1}`}
            onClick={() => onSelectLens?.(lens.id)}
          >
            <span className="cortex-lens-rail__glyph" aria-hidden="true">
              <LensGlyph lensId={lens.id} />
            </span>
            <span className="cortex-lens-rail__label">{lens.label}</span>
            <span className="cortex-lens-rail__hotkey" aria-hidden="true">⌘{idx + 1}</span>
            {isActive ? <span className="cortex-lens-rail__beam" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );
}
