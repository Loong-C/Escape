import {
  applyMove,
  getLegalMove,
  getPost,
  listLegalMoves,
  otherPlayer,
  type GameState,
  type LegalMove,
  type Player,
} from "../game";
import { extractFeatures, heuristicValue, terminalValue } from "./features";
import { SeededRandom } from "./random";
import { ValueNetwork } from "./value-network";

export interface RankedMove {
  move: LegalMove;
  state: GameState;
  score: number;
  learnedValue: number;
  heuristicValue: number;
}

function ownNeighborCount(state: GameState, move: LegalMove, player: Player): number {
  const coordinates = [
    [move.row - 1, move.col],
    [move.row + 1, move.col],
    [move.row, move.col - 1],
    [move.row, move.col + 1],
  ];
  return coordinates.reduce(
    (count, [row, col]) => count + (getPost(state, row, col) === player ? 1 : 0),
    0,
  );
}

function quickMovePriority(state: GameState, move: LegalMove): number {
  const player = state.turn;
  const opponent = otherPlayer(player);
  const ownNeighbors = ownNeighborCount(state, move, player);
  const opponentNeighbors = ownNeighborCount(state, move, opponent);
  const rowDistance = Math.abs(move.row - (state.ball.row + 0.5));
  const colDistance = Math.abs(move.col - (state.ball.col + 0.5));
  const nearBall = Math.max(0, 5 - (rowDistance + colDistance));
  const targetBoundary =
    player === "white"
      ? Math.min(move.col, state.size - move.col)
      : Math.min(move.row, state.size - move.row);
  const blockingBoundary =
    player === "white"
      ? Math.min(move.row, state.size - move.row)
      : Math.min(move.col, state.size - move.col);

  return (
    (move.kind === "replace" ? 30 : 0) +
    ownNeighbors * 18 +
    opponentNeighbors * 3 +
    nearBall * 2.5 +
    Math.max(0, 3 - targetBoundary) * 1.5 +
    Math.max(0, 2 - blockingBoundary)
  );
}

export function strategicCandidates(
  state: GameState,
  limit: number,
  random: SeededRandom,
): LegalMove[] {
  const legalMoves = listLegalMoves(state);
  if (legalMoves.length <= limit) {
    return legalMoves;
  }

  const ranked = legalMoves
    .map((move) => ({ move, priority: quickMovePriority(state, move) + random.next() * 0.01 }))
    .sort((left, right) => right.priority - left.priority);

  const deterministicCount = Math.max(1, Math.floor(limit * 0.8));
  const selected = ranked.slice(0, deterministicCount).map(({ move }) => move);
  const remaining = random.shuffle(ranked.slice(deterministicCount).map(({ move }) => move));
  selected.push(...remaining.slice(0, limit - selected.length));
  return selected;
}

export function rankMoves(
  state: GameState,
  model: ValueNetwork,
  random: SeededRandom,
  candidateLimit: number,
  perspective: Player = state.turn,
): RankedMove[] {
  const candidates = strategicCandidates(state, candidateLimit, random);
  const ranked = candidates.map((move) => {
    const next = applyMove(state, move);
    const terminal = terminalValue(next, perspective);
    const learned = terminal ?? model.evaluate(extractFeatures(next, perspective));
    const heuristic = terminal ?? heuristicValue(next, perspective);
    const tactical = next.lastMove?.shortestAfterPlacement.firstSteps.length === 1 ? 0.04 : 0;
    return {
      move,
      state: next,
      learnedValue: learned,
      heuristicValue: heuristic,
      score: terminal === null ? learned * 0.72 + heuristic * 0.28 + tactical : terminal * 10,
    };
  });

  return ranked.sort((left, right) => right.score - left.score);
}

export function chooseExploratoryMove(
  state: GameState,
  model: ValueNetwork,
  random: SeededRandom,
  options: {
    candidateLimit: number;
    epsilon: number;
    temperature: number;
  },
): RankedMove {
  const ranked = rankMoves(state, model, random, options.candidateLimit);
  const immediateWin = ranked.find((entry) => entry.score >= 9.5);
  if (immediateWin) {
    return immediateWin;
  }

  if (random.next() < options.epsilon) {
    return ranked[random.integer(ranked.length)];
  }

  const bestScore = ranked[0].score;
  const weights = ranked.map((entry) =>
    Math.exp((entry.score - bestScore) / Math.max(options.temperature, 0.02)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random.next() * total;
  for (let index = 0; index < ranked.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) {
      return ranked[index];
    }
  }
  return ranked[0];
}

export function isMoveLegal(state: GameState, move: LegalMove): boolean {
  return getLegalMove(state, move)?.kind === move.kind;
}
