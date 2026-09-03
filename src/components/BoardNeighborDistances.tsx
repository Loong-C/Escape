import type { CSSProperties } from "react";
import {
  DIRECTIONS,
  type Cell,
  type Direction,
  type DirectionalDistances,
} from "../game";

interface BoardNeighborDistancesProps {
  ball: Cell;
  boardSize: number;
  current: DirectionalDistances;
  after: DirectionalDistances | null;
  highlightShortest?: boolean;
}

const DIRECTION_LABELS: Record<Direction, string> = {
  up: "上方相邻格",
  right: "右方相邻格",
  down: "下方相邻格",
  left: "左方相邻格",
};

const DIRECTION_DELTAS: Record<Direction, Cell> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

const BOARD_MARGIN_RATIO = 0.104;
const BOARD_LENGTH_RATIO = 0.792;

function formatDistance(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

function positionForDirection(
  ball: Cell,
  boardSize: number,
  direction: Direction,
): CSSProperties {
  const delta = DIRECTION_DELTAS[direction];
  const step = BOARD_LENGTH_RATIO / boardSize;
  const x = BOARD_MARGIN_RATIO + (ball.col + 0.5 + delta.col) * step;
  const y = BOARD_MARGIN_RATIO + (ball.row + 0.5 + delta.row) * step;
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

export function BoardNeighborDistances({
  ball,
  boardSize,
  current,
  after,
  highlightShortest = false,
}: BoardNeighborDistancesProps) {
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
    <div className="neighbor-distances" aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{announcement}</span>
      {DIRECTIONS.map((direction) => {
        const next = after?.[direction] ?? null;
        const changed = next !== null && next !== current[direction];
        const isShortest =
          highlightShortest && shortest !== null && displayed[direction] === shortest;
        return (
          <div
            className={`neighbor-distance${isShortest ? " is-shortest" : ""}`}
            data-direction={direction}
            data-changed={changed ? "true" : "false"}
            key={direction}
            style={positionForDirection(ball, boardSize, direction)}
            aria-hidden="true"
          >
            <span className={changed ? "neighbor-distance__previous" : undefined}>
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
