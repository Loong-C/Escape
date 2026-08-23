import { type GameState, type LegalMove, type Player } from "../game";
import { extractFeatures, heuristicValue, terminalValue } from "./features";
import { rankMoves } from "./policy";
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
  const learned = model.evaluate(extractFeatures(state, rootPlayer));
  const heuristic = heuristicValue(state, rootPlayer);
  return learned * 0.82 + heuristic * 0.18;
}

function branchingLimit(depth: number): number {
  if (depth >= 4) return 8;
  if (depth === 3) return 10;
  if (depth === 2) return 14;
  return 18;
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

function easyChoice(
  state: GameState,
  model: ValueNetwork,
  random: SeededRandom,
  startedAt: number,
): SearchResult {
  const ranked = rankMoves(state, model, random, 64);
  const immediate = ranked.find((entry) => entry.score >= 9.5);
  if (immediate) {
    return {
      move: immediate.move,
      score: 1,
      depth: 1,
      nodes: ranked.length,
      elapsedMs: performance.now() - startedAt,
      candidates: ranked.length,
    };
  }

  const shortlist = ranked.slice(0, Math.min(3, ranked.length));
  const weights = shortlist.map((entry, index) => Math.exp(entry.score * 3.5 - index * 0.25));
  let threshold = random.next() * weights.reduce((sum, value) => sum + value, 0);
  let selected = shortlist[0];
  for (let index = 0; index < shortlist.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) {
      selected = shortlist[index];
      break;
    }
  }

  return {
    move: selected.move,
    score: selected.score,
    depth: 1,
    nodes: ranked.length,
    elapsedMs: performance.now() - startedAt,
    candidates: ranked.length,
  };
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
  if (options.difficulty === "easy") {
    return easyChoice(state, model, random, startedAt);
  }

  const timeBudget = options.timeBudgetMs ?? 3_600;
  const maxDepth = options.maxDepth ?? 4;
  const rootRanked = rankMoves(state, model, random, state.size < 7 ? 64 : 144);
  const immediate = rootRanked.find((entry) => entry.score >= 9.5);
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

  let bestMove = rootRanked[0].move;
  let bestScore = rootRanked[0].score;
  let completedDepth = 1;
  let totalNodes = rootRanked.length;
  const deadline = startedAt + timeBudget;
  const rootSearch = rootRanked.slice(0, state.size < 7 ? 64 : 48);

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

    try {
      for (const entry of rootSearch) {
        if (performance.now() >= deadline) {
          throw new SearchTimeout();
        }
        const score = searchNode(
          entry.state,
          depth - 1,
          Number.NEGATIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          context,
        );
        if (score > iterationBestScore) {
          iterationBestScore = score;
          iterationBestMove = entry.move;
        }
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
