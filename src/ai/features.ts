import {
  DIRECTIONS,
  countAnchoredPosts,
  countPosts,
  getDirectionalExitDistances,
  getShortestEscapeInfo,
  getWallSegments,
  isPassageBlocked,
  otherPlayer,
  type Direction,
  type GameState,
  type Player,
} from "../game";

export const FEATURE_NAMES = [
  "bias",
  "own-nearest-exit",
  "opponent-nearest-exit",
  "own-average-exit",
  "opponent-average-exit",
  "goal-distance-advantage",
  "own-boundary-openings",
  "opponent-boundary-openings",
  "boundary-opening-advantage",
  "axis-progress-advantage",
  "unique-shortest-step-alignment",
  "global-shortest-distance",
  "post-count-advantage",
  "anchor-count-advantage",
  "floating-post-advantage",
  "wall-count-advantage",
  "own-horizontal-walls",
  "own-vertical-walls",
  "opponent-horizontal-walls",
  "opponent-vertical-walls",
  "local-wall-advantage",
  "turn-control",
  "game-progress",
  "last-ball-step-alignment",
] as const;

const HORIZONTAL_EXITS: Direction[] = ["left", "right"];
const VERTICAL_EXITS: Direction[] = ["up", "down"];

function goalDirections(player: Player): Direction[] {
  return player === "white" ? HORIZONTAL_EXITS : VERTICAL_EXITS;
}

function normalizeDistance(distance: number, size: number): number {
  return Number.isFinite(distance) ? Math.min(distance / (size * 2 + 1), 1.2) : 1.35;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function boundaryOpenings(state: GameState, direction: Direction): number {
  let count = 0;
  for (let index = 0; index < state.size; index += 1) {
    const cell =
      direction === "up"
        ? { row: 0, col: index }
        : direction === "down"
          ? { row: state.size - 1, col: index }
          : direction === "left"
            ? { row: index, col: 0 }
            : { row: index, col: state.size - 1 };
    if (!isPassageBlocked(state, cell, direction)) {
      count += 1;
    }
  }
  return count;
}

function axisProgress(state: GameState, player: Player): number {
  const horizontal =
    1 -
    Math.min(state.ball.col + 1, state.size - state.ball.col) /
      (Math.floor(state.size / 2) + 1);
  const vertical =
    1 -
    Math.min(state.ball.row + 1, state.size - state.ball.row) /
      (Math.floor(state.size / 2) + 1);
  return player === "white" ? horizontal - vertical : vertical - horizontal;
}

function directionAlignment(direction: Direction, player: Player): number {
  if (goalDirections(player).includes(direction)) {
    return 1;
  }
  if (goalDirections(otherPlayer(player)).includes(direction)) {
    return -1;
  }
  return 0;
}

export function extractFeatures(state: GameState, perspective: Player): number[] {
  const opponent = otherPlayer(perspective);
  const distances = getDirectionalExitDistances(state);
  const ownDirections = goalDirections(perspective);
  const opponentDirections = goalDirections(opponent);
  const ownDistances = ownDirections.map((direction) =>
    normalizeDistance(distances[direction], state.size),
  );
  const opponentDistances = opponentDirections.map((direction) =>
    normalizeDistance(distances[direction], state.size),
  );
  const ownNearest = Math.min(...ownDistances);
  const opponentNearest = Math.min(...opponentDistances);

  const ownOpenings = ownDirections.reduce(
    (sum, direction) => sum + boundaryOpenings(state, direction),
    0,
  );
  const opponentOpenings = opponentDirections.reduce(
    (sum, direction) => sum + boundaryOpenings(state, direction),
    0,
  );
  const openingScale = state.size * 2;

  const ownPosts = countPosts(state, perspective);
  const opponentPosts = countPosts(state, opponent);
  const ownAnchors = countAnchoredPosts(state, perspective);
  const opponentAnchors = countAnchoredPosts(state, opponent);
  const ownFloats = ownPosts - ownAnchors;
  const opponentFloats = opponentPosts - opponentAnchors;
  const postScale = (state.size + 1) * (state.size + 1);

  const walls = getWallSegments(state);
  const ownWalls = walls.filter((wall) => wall.color === perspective);
  const opponentWalls = walls.filter((wall) => wall.color === opponent);
  const wallScale = state.size * (state.size + 1) * 2;
  const ownHorizontal = ownWalls.filter((wall) => wall.orientation === "horizontal").length;
  const ownVertical = ownWalls.length - ownHorizontal;
  const opponentHorizontal = opponentWalls.filter(
    (wall) => wall.orientation === "horizontal",
  ).length;
  const opponentVertical = opponentWalls.length - opponentHorizontal;

  const localOwnWalls = ownWalls.filter(
    (wall) =>
      Math.abs(wall.row - state.ball.row) + Math.abs(wall.col - state.ball.col) <= 3,
  ).length;
  const localOpponentWalls = opponentWalls.filter(
    (wall) =>
      Math.abs(wall.row - state.ball.row) + Math.abs(wall.col - state.ball.col) <= 3,
  ).length;

  const shortest = getShortestEscapeInfo(state);
  const uniqueAlignment =
    shortest.firstSteps.length === 1
      ? directionAlignment(shortest.firstSteps[0], perspective)
      : 0;
  const lastAlignment = state.lastMove?.escapedThrough
    ? directionAlignment(state.lastMove.escapedThrough, perspective)
    : state.lastMove?.ballAfter &&
        (state.lastMove.ballAfter.row !== state.lastMove.ballBefore.row ||
          state.lastMove.ballAfter.col !== state.lastMove.ballBefore.col)
      ? directionAlignment(
          state.lastMove.ballAfter.row < state.lastMove.ballBefore.row
            ? "up"
            : state.lastMove.ballAfter.row > state.lastMove.ballBefore.row
              ? "down"
              : state.lastMove.ballAfter.col < state.lastMove.ballBefore.col
                ? "left"
                : "right",
          perspective,
        )
      : 0;

  return [
    1,
    ownNearest,
    opponentNearest,
    mean(ownDistances),
    mean(opponentDistances),
    opponentNearest - ownNearest,
    ownOpenings / openingScale,
    opponentOpenings / openingScale,
    (ownOpenings - opponentOpenings) / openingScale,
    axisProgress(state, perspective),
    uniqueAlignment,
    normalizeDistance(shortest.distance, state.size),
    (ownPosts - opponentPosts) / postScale,
    (ownAnchors - opponentAnchors) / postScale,
    (ownFloats - opponentFloats) / postScale,
    (ownWalls.length - opponentWalls.length) / wallScale,
    ownHorizontal / wallScale,
    ownVertical / wallScale,
    opponentHorizontal / wallScale,
    opponentVertical / wallScale,
    (localOwnWalls - localOpponentWalls) / 16,
    state.turn === perspective ? 1 : -1,
    Math.min(state.moveNumber / postScale, 1),
    lastAlignment,
  ];
}

export function heuristicValue(state: GameState, perspective: Player): number {
  if (state.outcome.status === "won") {
    return state.outcome.winner === perspective ? 1 : -1;
  }
  if (state.outcome.status === "draw") {
    return 0;
  }

  const features = extractFeatures(state, perspective);
  const score =
    features[5] * 2.8 +
    features[9] * 1.2 +
    features[10] * 0.9 +
    features[8] * 0.45 +
    features[13] * 0.35 +
    features[15] * 0.3 +
    features[20] * 0.25 +
    features[23] * 0.5;
  return Math.tanh(score);
}

export function terminalValue(state: GameState, perspective: Player): number | null {
  if (state.outcome.status === "draw") {
    return 0;
  }
  if (state.outcome.status === "won") {
    return state.outcome.winner === perspective ? 1 : -1;
  }
  return null;
}

export function targetDirections(player: Player): readonly Direction[] {
  return goalDirections(player);
}

export function assertFeatureShape(features: readonly number[]): void {
  if (features.length !== FEATURE_NAMES.length || features.some((value) => !Number.isFinite(value))) {
    throw new Error("AI 特征向量无效");
  }
}

export function allDirections(): readonly Direction[] {
  return DIRECTIONS;
}
