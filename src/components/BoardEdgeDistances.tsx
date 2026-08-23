import { DIRECTIONS, type Direction, type DirectionalDistances } from "../game";

interface BoardEdgeDistancesProps {
  current: DirectionalDistances;
  after: DirectionalDistances | null;
}

const DIRECTION_META: Record<Direction, { label: string; symbol: string }> = {
  up: { label: "上边", symbol: "↑" },
  right: { label: "右边", symbol: "→" },
  down: { label: "下边", symbol: "↓" },
  left: { label: "左边", symbol: "←" },
};

function formatDistance(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

export function BoardEdgeDistances({ current, after }: BoardEdgeDistancesProps) {
  const announcement = DIRECTIONS.map((direction) => {
    const { label } = DIRECTION_META[direction];
    const currentText = formatDistance(current[direction]);
    if (!after) return `${label}当前 ${currentText} 步`;
    return `${label}当前 ${currentText} 步，落子后 ${formatDistance(after[direction])} 步`;
  }).join("；");

  return (
    <div className="edge-distances" aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{announcement}</span>
      {DIRECTIONS.map((direction) => {
        const next = after?.[direction] ?? null;
        const changed = next !== null && next !== current[direction];
        return (
          <div
            className="edge-distance"
            data-direction={direction}
            key={direction}
            aria-hidden="true"
          >
            <span className="edge-distance__direction">
              {DIRECTION_META[direction].symbol}
            </span>
            <span>{formatDistance(current[direction])}</span>
            {next !== null && (
              <>
                <span className="edge-distance__separator">›</span>
                <strong className={changed ? "is-changed" : undefined}>
                  {formatDistance(next)}
                </strong>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
