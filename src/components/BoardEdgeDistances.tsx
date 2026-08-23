import { DIRECTIONS, type Direction, type DirectionalDistances } from "../game";

interface BoardEdgeDistancesProps {
  current: DirectionalDistances;
  after: DirectionalDistances | null;
  highlightShortest?: boolean;
}

const DIRECTION_LABELS: Record<Direction, string> = {
  up: "上边",
  right: "右边",
  down: "下边",
  left: "左边",
};

function formatDistance(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

export function BoardEdgeDistances({
  current,
  after,
  highlightShortest = false,
}: BoardEdgeDistancesProps) {
  const displayed = after ?? current;
  const finiteDistances = DIRECTIONS.map((direction) => displayed[direction]).filter(
    Number.isFinite,
  );
  const shortest = finiteDistances.length > 0 ? Math.min(...finiteDistances) : null;
  const announcement = DIRECTIONS.map((direction) => {
    const label = DIRECTION_LABELS[direction];
    const currentText = formatDistance(current[direction]);
    if (!after || after[direction] === current[direction]) {
      return `${label} ${currentText} 步`;
    }
    return `${label}从 ${currentText} 步变为 ${formatDistance(after[direction])} 步`;
  }).join("；");

  return (
    <div className="edge-distances" aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{announcement}</span>
      {DIRECTIONS.map((direction) => {
        const next = after?.[direction] ?? null;
        const changed = next !== null && next !== current[direction];
        const isShortest =
          highlightShortest && shortest !== null && displayed[direction] === shortest;
        return (
          <div
            className={`edge-distance${isShortest ? " is-shortest" : ""}`}
            data-direction={direction}
            data-changed={changed ? "true" : "false"}
            key={direction}
            aria-hidden="true"
          >
            <span className={changed ? "edge-distance__previous" : undefined}>
              {formatDistance(current[direction])}
            </span>
            {changed && next !== null && (
              <strong className="is-changed">{formatDistance(next)}</strong>
            )}
          </div>
        );
      })}
    </div>
  );
}
