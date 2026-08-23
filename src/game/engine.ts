import {
  DIRECTIONS,
  type Cell,
  type Direction,
  type DirectionalDistances,
  type GameState,
  type LegalMove,
  type Move,
  type MovePreview,
  type Player,
  type Post,
  type ShortestEscapeInfo,
  type WallSegment,
} from "./types";

const PLAYING_OUTCOME = {
  status: "playing",
  winner: null,
  reason: null,
} as const;

const DIRECTION_DELTAS: Record<Direction, Cell> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

function assertBoardSize(size: number): void {
  if (!Number.isInteger(size) || size < 3 || size % 2 === 0) {
    throw new Error("棋盘边长必须是大于等于 3 的奇数");
  }
}

export function createGame(size = 11): GameState {
  assertBoardSize(size);
  const center = Math.floor(size / 2);

  return {
    size,
    posts: Array<Post>((size + 1) * (size + 1)).fill(null),
    ball: { row: center, col: center },
    turn: "white",
    moveNumber: 0,
    outcome: PLAYING_OUTCOME,
    lastMove: null,
  };
}

export function otherPlayer(player: Player): Player {
  return player === "white" ? "black" : "white";
}

export function vertexIndex(size: number, row: number, col: number): number {
  return row * (size + 1) + col;
}

export function cellIndex(size: number, row: number, col: number): number {
  return row * size + col;
}

export function isVertexInside(size: number, row: number, col: number): boolean {
  return row >= 0 && row <= size && col >= 0 && col <= size;
}

export function isCellInside(size: number, row: number, col: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

export function getPost(state: GameState, row: number, col: number): Post {
  if (!isVertexInside(state.size, row, col)) {
    return null;
  }
  return state.posts[vertexIndex(state.size, row, col)] ?? null;
}

export function setPost(
  state: GameState,
  row: number,
  col: number,
  post: Post,
): GameState {
  if (!isVertexInside(state.size, row, col)) {
    throw new Error(`桩坐标越界: (${row}, ${col})`);
  }

  const posts = state.posts.slice();
  posts[vertexIndex(state.size, row, col)] = post;
  return { ...state, posts };
}

function hasSameColorNeighbor(
  state: GameState,
  row: number,
  col: number,
  color: Player,
): boolean {
  return DIRECTIONS.some((direction) => {
    const delta = DIRECTION_DELTAS[direction];
    return getPost(state, row + delta.row, col + delta.col) === color;
  });
}

export function isAnchored(state: GameState, row: number, col: number): boolean {
  const color = getPost(state, row, col);
  return color !== null && hasSameColorNeighbor(state, row, col, color);
}

export function getLegalMove(state: GameState, move: Move): LegalMove | null {
  if (
    state.outcome.status !== "playing" ||
    !isVertexInside(state.size, move.row, move.col)
  ) {
    return null;
  }

  const occupant = getPost(state, move.row, move.col);
  if (occupant === null) {
    return { ...move, kind: "place" };
  }

  if (
    occupant === otherPlayer(state.turn) &&
    !isAnchored(state, move.row, move.col) &&
    hasSameColorNeighbor(state, move.row, move.col, state.turn)
  ) {
    return { ...move, kind: "replace" };
  }

  return null;
}

export function listLegalMoves(state: GameState): LegalMove[] {
  if (state.outcome.status !== "playing") {
    return [];
  }

  const moves: LegalMove[] = [];
  for (let row = 0; row <= state.size; row += 1) {
    for (let col = 0; col <= state.size; col += 1) {
      const move = getLegalMove(state, { row, col });
      if (move) {
        moves.push(move);
      }
    }
  }
  return moves;
}

export function getWallSegments(state: GameState): WallSegment[] {
  const segments: WallSegment[] = [];

  for (let row = 0; row <= state.size; row += 1) {
    for (let col = 0; col <= state.size; col += 1) {
      const color = getPost(state, row, col);
      if (!color) {
        continue;
      }

      if (col < state.size && getPost(state, row, col + 1) === color) {
        segments.push({ orientation: "horizontal", row, col, color });
      }
      if (row < state.size && getPost(state, row + 1, col) === color) {
        segments.push({ orientation: "vertical", row, col, color });
      }
    }
  }

  return segments;
}

function hasHorizontalWall(state: GameState, row: number, col: number): boolean {
  const left = getPost(state, row, col);
  return left !== null && left === getPost(state, row, col + 1);
}

function hasVerticalWall(state: GameState, row: number, col: number): boolean {
  const top = getPost(state, row, col);
  return top !== null && top === getPost(state, row + 1, col);
}

export function isPassageBlocked(
  state: GameState,
  cell: Cell,
  direction: Direction,
): boolean {
  switch (direction) {
    case "up":
      return hasHorizontalWall(state, cell.row, cell.col);
    case "right":
      return hasVerticalWall(state, cell.row, cell.col + 1);
    case "down":
      return hasHorizontalWall(state, cell.row + 1, cell.col);
    case "left":
      return hasVerticalWall(state, cell.row, cell.col);
  }
}

type WalkResult =
  | { type: "cell"; cell: Cell }
  | { type: "outside"; direction: Direction }
  | null;

export function walk(
  state: GameState,
  cell: Cell,
  direction: Direction,
): WalkResult {
  if (isPassageBlocked(state, cell, direction)) {
    return null;
  }

  const delta = DIRECTION_DELTAS[direction];
  const next = { row: cell.row + delta.row, col: cell.col + delta.col };
  if (isCellInside(state.size, next.row, next.col)) {
    return { type: "cell", cell: next };
  }
  return { type: "outside", direction };
}

function distancesFromCell(state: GameState, start: Cell): number[] {
  const distances = Array<number>(state.size * state.size).fill(Number.POSITIVE_INFINITY);
  const queue: Cell[] = [start];
  let head = 0;
  distances[cellIndex(state.size, start.row, start.col)] = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const currentDistance = distances[cellIndex(state.size, current.row, current.col)];

    for (const direction of DIRECTIONS) {
      const result = walk(state, current, direction);
      if (!result || result.type !== "cell") {
        continue;
      }

      const index = cellIndex(state.size, result.cell.row, result.cell.col);
      if (distances[index] !== Number.POSITIVE_INFINITY) {
        continue;
      }
      distances[index] = currentDistance + 1;
      queue.push(result.cell);
    }
  }

  return distances;
}

function nearestExitDistances(state: GameState): number[] {
  const distances = Array<number>(state.size * state.size).fill(Number.POSITIVE_INFINITY);
  const queue: Cell[] = [];

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const cell = { row, col };
      const canExit = DIRECTIONS.some(
        (direction) => walk(state, cell, direction)?.type === "outside",
      );
      if (canExit) {
        distances[cellIndex(state.size, row, col)] = 1;
        queue.push(cell);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDistance = distances[cellIndex(state.size, current.row, current.col)];

    for (const direction of DIRECTIONS) {
      const result = walk(state, current, direction);
      if (!result || result.type !== "cell") {
        continue;
      }
      const index = cellIndex(state.size, result.cell.row, result.cell.col);
      if (distances[index] <= currentDistance + 1) {
        continue;
      }
      distances[index] = currentDistance + 1;
      queue.push(result.cell);
    }
  }

  return distances;
}

export function getDirectionalExitDistances(
  state: GameState,
  from: Cell = state.ball,
): DirectionalDistances {
  const cellDistances = distancesFromCell(state, from);
  const result: DirectionalDistances = {
    up: Number.POSITIVE_INFINITY,
    right: Number.POSITIVE_INFINITY,
    down: Number.POSITIVE_INFINITY,
    left: Number.POSITIVE_INFINITY,
  };

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const distance = cellDistances[cellIndex(state.size, row, col)];
      if (!Number.isFinite(distance)) {
        continue;
      }

      const cell = { row, col };
      for (const direction of DIRECTIONS) {
        const step = walk(state, cell, direction);
        if (step?.type === "outside") {
          result[direction] = Math.min(result[direction], distance + 1);
        }
      }
    }
  }

  return result;
}

export function getShortestEscapeInfo(state: GameState): ShortestEscapeInfo {
  const exitDistances = nearestExitDistances(state);
  const distance = exitDistances[cellIndex(state.size, state.ball.row, state.ball.col)];

  if (!Number.isFinite(distance)) {
    return { distance: Number.POSITIVE_INFINITY, firstSteps: [] };
  }

  const firstSteps = DIRECTIONS.filter((direction) => {
    const result = walk(state, state.ball, direction);
    if (!result) {
      return false;
    }
    if (result.type === "outside") {
      return distance === 1;
    }
    const remaining = exitDistances[cellIndex(state.size, result.cell.row, result.cell.col)];
    return remaining + 1 === distance;
  });

  return { distance, firstSteps };
}

function stateAfterPost(state: GameState, move: LegalMove): GameState {
  const posts = state.posts.slice();
  posts[vertexIndex(state.size, move.row, move.col)] = state.turn;
  return { ...state, posts };
}

export function previewMove(state: GameState, move: Move): MovePreview | null {
  const legalMove = getLegalMove(state, move);
  if (!legalMove) {
    return null;
  }

  const before = getDirectionalExitDistances(state);
  const afterState = stateAfterPost(state, legalMove);
  const afterPlacement = getDirectionalExitDistances(afterState);
  const shortestAfterPlacement = getShortestEscapeInfo(afterState);

  return {
    move: legalMove,
    before,
    afterPlacement,
    shortestAfterPlacement,
    ballWillMove:
      shortestAfterPlacement.firstSteps.length === 1
        ? shortestAfterPlacement.firstSteps[0]
        : null,
    wouldTrap: !Number.isFinite(shortestAfterPlacement.distance),
  };
}

function winnerForExit(direction: Direction): Player {
  return direction === "left" || direction === "right" ? "white" : "black";
}

export function applyMove(state: GameState, move: Move): GameState {
  const legalMove = getLegalMove(state, move);
  if (!legalMove) {
    throw new Error(`非法落子: (${move.row}, ${move.col})`);
  }

  const ballBefore = { ...state.ball };
  let nextState = stateAfterPost(state, legalMove);
  const distancesAfterPlacement = getDirectionalExitDistances(nextState);
  const shortestAfterPlacement = getShortestEscapeInfo(nextState);
  let ballAfter: Cell | null = { ...ballBefore };
  let escapedThrough: Direction | null = null;

  if (!Number.isFinite(shortestAfterPlacement.distance)) {
    nextState = {
      ...nextState,
      outcome: { status: "won", winner: state.turn, reason: "trapped" },
    };
  } else if (shortestAfterPlacement.firstSteps.length === 1) {
    const direction = shortestAfterPlacement.firstSteps[0];
    const step = walk(nextState, nextState.ball, direction);
    if (step?.type === "outside") {
      escapedThrough = direction;
      ballAfter = null;
      nextState = {
        ...nextState,
        outcome: {
          status: "won",
          winner: winnerForExit(direction),
          reason: "escaped",
        },
      };
    } else if (step?.type === "cell") {
      ballAfter = step.cell;
      nextState = { ...nextState, ball: step.cell };
    }
  }

  nextState = {
    ...nextState,
    moveNumber: state.moveNumber + 1,
    lastMove: {
      player: state.turn,
      move: legalMove,
      ballBefore,
      ballAfter,
      escapedThrough,
      shortestAfterPlacement,
      distancesAfterPlacement,
    },
  };

  if (nextState.outcome.status !== "playing") {
    return nextState;
  }

  nextState = { ...nextState, turn: otherPlayer(state.turn) };
  return adjudicateTurnStart(nextState);
}

export function adjudicateTurnStart(state: GameState): GameState {
  if (state.outcome.status === "playing" && listLegalMoves(state).length === 0) {
    return {
      ...state,
      outcome: { status: "draw", winner: null, reason: "no-legal-moves" },
    };
  }
  return state;
}

export function countPosts(state: GameState, player: Player): number {
  return state.posts.reduce(
    (count, post) => count + (post === player ? 1 : 0),
    0,
  );
}

export function countAnchoredPosts(state: GameState, player: Player): number {
  let count = 0;
  for (let row = 0; row <= state.size; row += 1) {
    for (let col = 0; col <= state.size; col += 1) {
      if (getPost(state, row, col) === player && isAnchored(state, row, col)) {
        count += 1;
      }
    }
  }
  return count;
}
