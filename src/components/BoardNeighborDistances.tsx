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
  distances: DirectionalDistances;
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
  distances,
  highlightShortest = false,
}: BoardNeighborDistancesProps) {
  const shortest = Math.min(...DIRECTIONS.map((direction) => distances[direction]));
  const shortestDirections = DIRECTIONS.filter(
    (direction) => distances[direction] === shortest,
  );
  const uniqueShortest = shortestDirections.length === 1 ? shortestDirections[0] : null;
  const announcement = DIRECTIONS.map(
    (direction) => `${DIRECTION_LABELS[direction]} ${formatDistance(distances[direction])} 步`,
  ).join("；");

  return (
    <div className="neighbor-distances" aria-live="polite" aria-atomic="true">
      <span className="visually-hidden">{announcement}</span>
      {DIRECTIONS.map((direction) => {
        const isShortest = highlightShortest && direction === uniqueShortest;
        return (
          <div
            className={`neighbor-distance${isShortest ? " is-shortest" : ""}`}
            data-direction={direction}
            key={direction}
            style={positionForDirection(ball, boardSize, direction)}
            aria-hidden="true"
          >
            {formatDistance(distances[direction])}
          </div>
        );
      })}
    </div>
  );
}
