import {
  applyMove,
  getLegalMove,
  listLegalMoves,
  otherPlayer,
  type GameState,
  type LegalMove,
  type Player,
} from "../game";
import { extractFeatures, terminalValue } from "./features";
import { rankMoves, type RankedMove } from "./policy";
import { SeededRandom } from "./random";
import { ValueNetwork } from "./value-network";

export type AiDifficulty = "easy" | "hard";

export interface SearchResult {
  move: LegalMove;
  score: number;
  depth: number;
  nodes: number;
  elapsedMs: number;
  candidates: number;
}

export interface SearchOptions {
  difficulty: AiDifficulty;
  timeBudgetMs?: number;
  maxDepth?: number;
  seed?: number;
}

class SearchTimeout extends Error {}

interface SearchContext {
  model: ValueNetwork;
  rootPlayer: Player;
  deadline: number;
  random: SeededRandom;
  nodes: number;
  table: Map<string, number>;
}

function hashState(state: GameState, depth: number, rootPlayer: Player): string {
  let hash = 2_166_136_261;
  for (const post of state.posts) {
    hash ^= post === null ? 0 : post === "white" ? 1 : 2;
    hash = Math.imul(hash, 16_777_619);
  }
  hash ^= state.ball.row * 31 + state.ball.col * 131;
  hash = Math.imul(hash, 16_777_619);
  hash ^= state.turn === "white" ? 7 : 13;
  return `${hash >>> 0}:${depth}:${rootPlayer}`;
}

function leafValue(state: GameState, model: ValueNetwork, rootPlayer: Player): number {
  const terminal = terminalValue(state, rootPlayer);
  if (terminal !== null) {
    return terminal;
  }
  return model.evaluate(extractFeatures(state, rootPlayer));
}

function branchingLimit(depth: number): number {
  if (depth >= 4) return 5;
  if (depth === 3) return 6;
  if (depth === 2) return 8;
  return 10;
}

function immediateWinningMoves(state: GameState): LegalMove[] {
  if (state.outcome.status !== "playing") return [];
  const player = state.turn;
  const wins: LegalMove[] = [];
  for (const move of listLegalMoves(state)) {
    const next = applyMove(state, move);
    if (next.outcome.status === "won" && next.outcome.winner === player) {
      wins.push(move);
    }
  }
  return wins;
}

function hasImmediateWinningMove(state: GameState): boolean {
  if (state.outcome.status !== "playing") return false;
  const player = state.turn;
  for (const move of listLegalMoves(state)) {
    const next = applyMove(state, move);
    if (next.outcome.status === "won" && next.outcome.winner === player) {
      return true;
    }
  }
  return false;
}

function forcedDefensiveResponses(
  state: GameState,
  ranked: RankedMove[],
): RankedMove[] {
  // This is an exhaustive one-ply terminal proof. It never estimates position
  // quality: it only removes moves when the rules demonstrate a loss next turn.
  const opponentThreatState: GameState = {
    ...state,
    turn: otherPlayer(state.turn),
  };
  const threats = immediateWinningMoves(opponentThreatState);
  if (threats.length === 0) return [];

  const candidatesBlockingKnownWins = ranked.filter((entry) => {
    if (entry.state.outcome.status === "won") {
      return entry.state.outcome.winner === state.turn;
    }
    return threats.every((threat) => {
      if (!getLegalMove(entry.state, threat)) return true;
      const reply = applyMove(entry.state, threat);
      return !(
        reply.outcome.status === "won" &&
        reply.outcome.winner === entry.state.turn
      );
    });
  });

  return candidatesBlockingKnownWins.filter((entry) => {
    if (entry.state.outcome.status === "won") return true;
    return !hasImmediateWinningMove(entry.state);
  });
}

function searchNode(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
): number {
  context.nodes += 1;
  if ((context.nodes & 31) === 0 && performance.now() >= context.deadline) {
    throw new SearchTimeout();
  }

  const terminal = terminalValue(state, context.rootPlayer);
  if (terminal !== null || depth === 0) {
    return terminal ?? leafValue(state, context.model, context.rootPlayer);
  }

  const key = hashState(state, depth, context.rootPlayer);
  const cached = context.table.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const maximizing = state.turn === context.rootPlayer;
  let value = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let completedWithoutCutoff = true;
  const moves = rankMoves(
    state,
    context.model,
    context.random,
    branchingLimit(depth),
    state.turn,
  );

  for (const entry of moves) {
    const childValue = searchNode(entry.state, depth - 1, alpha, beta, context);
    if (maximizing) {
      value = Math.max(value, childValue);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, childValue);
      beta = Math.min(beta, value);
    }

    if (beta <= alpha) {
      completedWithoutCutoff = false;
      break;
    }
  }

  if (completedWithoutCutoff) {
    context.table.set(key, value);
  }
  return value;
}

export function chooseMoveWithSearch(
  state: GameState,
  model: ValueNetwork,
  options: SearchOptions,
): SearchResult {
  if (state.outcome.status !== "playing") {
    throw new Error("终局状态不能继续搜索落子");
  }

  const startedAt = performance.now();
  const random = new SeededRandom(options.seed ?? state.moveNumber * 65_537 + 97);
  const timeBudget = options.timeBudgetMs ?? 12_000;
  const maxDepth = options.maxDepth ?? 5;
  const rootRanked = rankMoves(state, model, random, state.size < 7 ? 64 : 144);
  const immediate = rootRanked.find((entry) => entry.score >= 1.5);
  if (immediate) {
    return {
      move: immediate.move,
      score: 1,
      depth: 1,
      nodes: rootRanked.length,
      elapsedMs: performance.now() - startedAt,
      candidates: rootRanked.length,
    };
  }

  const forcedResponses = forcedDefensiveResponses(state, rootRanked);
  const rootPool = forcedResponses.length > 0 ? forcedResponses : rootRanked;
  let bestMove = rootPool[0].move;
  let bestScore = rootPool[0].score;
  let completedDepth = 1;
  let totalNodes = rootRanked.length;
  const deadline = startedAt + timeBudget;
  const rootSearch = rootPool.slice(0, state.size < 7 ? 24 : 12);

  for (let depth = 2; depth <= maxDepth; depth += 1) {
    const context: SearchContext = {
      model,
      rootPlayer: state.turn,
      deadline,
      random,
      nodes: 0,
      table: new Map(),
    };
    let iterationBestMove = bestMove;
    let iterationBestScore = Number.NEGATIVE_INFINITY;
    let rootAlpha = Number.NEGATIVE_INFINITY;
    const orderedRoot = [
      ...rootSearch.filter(
        (entry) => entry.move.row === bestMove.row && entry.move.col === bestMove.col,
      ),
      ...rootSearch.filter(
        (entry) => entry.move.row !== bestMove.row || entry.move.col !== bestMove.col,
      ),
    ];

    try {
      for (const entry of orderedRoot) {
        if (performance.now() >= deadline) {
          throw new SearchTimeout();
        }
        const score = searchNode(
          entry.state,
          depth - 1,
          rootAlpha,
          Number.POSITIVE_INFINITY,
          context,
        );
        if (score > iterationBestScore) {
          iterationBestScore = score;
          iterationBestMove = entry.move;
        }
        rootAlpha = Math.max(rootAlpha, score);
      }

      bestMove = iterationBestMove;
      bestScore = iterationBestScore;
      completedDepth = depth;
      totalNodes += context.nodes;
    } catch (error) {
      if (!(error instanceof SearchTimeout)) {
        throw error;
      }
      totalNodes += context.nodes;
      break;
    }
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: completedDepth,
    nodes: totalNodes,
    elapsedMs: performance.now() - startedAt,
    candidates: rootRanked.length,
  };
}
