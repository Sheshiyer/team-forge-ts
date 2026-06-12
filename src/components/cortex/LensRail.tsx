import type { CortexLensDefinition } from "../../lib/commandCortex/lensTypes";
import type { CortexLensId } from "../../lib/commandCortex/types";

export interface LensRailProps {
  lenses: CortexLensDefinition[];
  activeLens: CortexLensId;
  onSelectLens?: (lensId: CortexLensId) => void;
}

export default function LensRail({ lenses, activeLens, onSelectLens }: LensRailProps) {
  return (
    <nav className="cortex-lens-rail" aria-label="Command Cortex lenses">
      {lenses.map((lens) => (
        <button
          key={lens.id}
          type="button"
          className={lens.id === activeLens ? "is-active" : undefined}
          title={lens.legacyPages.join(", ")}
          onClick={() => onSelectLens?.(lens.id)}
        >
          {lens.label}
        </button>
      ))}
    </nav>
  );
}
