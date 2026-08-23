import {
  applyMove,
  getLegalMove,
  listLegalMoves,
  type GameState,
  type LegalMove,
  type Player,
} from "../game";
import { extractFeatures, terminalValue } from "./features";
import { SeededRandom } from "./random";
import { ValueNetwork } from "./value-network";

export interface RankedMove {
  move: LegalMove;
  state: GameState;
  score: number;
  learnedValue: number;
  terminal: boolean;
}

export function sampleCandidates(
  state: GameState,
  limit: number,
  random: SeededRandom,
): LegalMove[] {
  const legalMoves = listLegalMoves(state);
  if (legalMoves.length <= limit) {
    return legalMoves;
  }
  return random.shuffle(legalMoves).slice(0, limit);
}

export function rankMoves(
  state: GameState,
  model: ValueNetwork,
  random: SeededRandom,
  candidateLimit: number,
  perspective: Player = state.turn,
  sample = false,
): RankedMove[] {
  const candidates = sample
    ? sampleCandidates(state, candidateLimit, random)
    : listLegalMoves(state);
  const ranked = candidates.map((move) => {
    const next = applyMove(state, move);
    const terminal = terminalValue(next, perspective);
    const learned = terminal ?? model.evaluate(extractFeatures(next, perspective));
    return {
      move,
      state: next,
      learnedValue: learned,
      terminal: terminal !== null,
      score: terminal === null ? learned : terminal * 2,
      tieBreak: random.next(),
    };
  });

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score || right.tieBreak - left.tieBreak,
    )
    .slice(0, candidateLimit)
    .map(({ tieBreak: _tieBreak, ...entry }) => entry);
}

export function chooseExploratoryMove(
  state: GameState,
  model: ValueNetwork,
  random: SeededRandom,
  options: {
    candidateLimit: number;
    epsilon: number;
    temperature: number;
    fullPolicyRate?: number;
  },
): RankedMove {
  const sample = random.next() >= (options.fullPolicyRate ?? 0);
  const ranked = rankMoves(
    state,
    model,
    random,
    options.candidateLimit,
    state.turn,
    sample,
  );
  const immediateWin = ranked.find((entry) => entry.score >= 1.5);
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
