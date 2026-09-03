import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  ValueNetwork,
  FEATURE_NAMES,
  chooseMoveWithSearch,
  extractFeatures,
  sampleCandidates,
} from "../src/ai";
import {
  applyMove,
  createGame,
  listLegalMoves,
  setPost,
  type GameState,
  type Player,
} from "../src/game";

function placeMany(
  state: GameState,
  entries: Array<[number, number, Player]>,
): GameState {
  return entries.reduce(
    (current, [row, col, player]) => setPost(current, row, col, player),
    state,
  );
}

describe("AI foundation", () => {
  it("extracts a finite, stable feature vector", () => {
    const state = createGame();
    const features = extractFeatures(state, "white");
    expect(features).toHaveLength(FEATURE_NAMES.length);
    expect(features).toHaveLength(128);
    expect(features.every(Number.isFinite)).toBe(true);
  });

  it("round-trips value network weights", () => {
    const state = createGame();
    const network = new ValueNetwork(8, new SeededRandom(7));
    const before = network.evaluate(extractFeatures(state, "white"));
    const restored = ValueNetwork.fromJSON(
      network.serialize({
        algorithm: "test",
        episodes: 0,
        seed: 7,
        trainedAt: "2026-08-23T00:00:00.000Z",
        elapsedSeconds: 0,
        whiteWins: 0,
        blackWins: 0,
        draws: 0,
      }),
    );
    expect(restored.evaluate(extractFeatures(state, "white"))).toBeCloseTo(before, 12);
  });

  it("uniformly samples only legal candidates", () => {
    const state = createGame();
    const candidates = sampleCandidates(state, 20, new SeededRandom(1));
    expect(candidates).toHaveLength(20);
    expect(candidates.every((move) => move.kind === "place")).toBe(true);
  });

  it("takes an immediate trapping win before deeper search", () => {
    const state = placeMany(createGame(3), [
      [1, 1, "white"],
      [1, 2, "white"],
      [2, 1, "white"],
    ]);
    const model = new ValueNetwork(8, new SeededRandom(2));
    const result = chooseMoveWithSearch(state, model, {
      difficulty: "hard",
      timeBudgetMs: 200,
      maxDepth: 3,
      seed: 2,
    });
    expect(result.move).toMatchObject({ row: 2, col: 2 });
  });

  it.each([
    {
      missing: [9, 9],
      support: [9, 10],
      opponentPosts: [[8, 8], [8, 9], [9, 8]],
    },
    {
      missing: [9, 8],
      support: [9, 7],
      opponentPosts: [[8, 8], [8, 9], [9, 9]],
    },
    {
      missing: [8, 9],
      support: [8, 10],
      opponentPosts: [[8, 8], [9, 8], [9, 9]],
    },
    {
      missing: [8, 8],
      support: [8, 7],
      opponentPosts: [[8, 9], [9, 8], [9, 9]],
    },
  ])("finds an exact response to the enclosure threat at $missing", (scenario) => {
    const entries: Array<[number, number, Player]> = [
      ...scenario.opponentPosts.map(
        ([row, col]) => [row, col, "black"] as [number, number, Player],
      ),
      [scenario.support[0], scenario.support[1], "white"],
    ];
    const state = placeMany(createGame(), entries);
    const model = new ValueNetwork(12, new SeededRandom(11));
    const result = chooseMoveWithSearch(state, model, {
      difficulty: "hard",
      timeBudgetMs: 250,
      maxDepth: 1,
      seed: 17,
    });

    const afterDefense = applyMove(state, result.move);
    const opponentCanWinImmediately = listLegalMoves(afterDefense).some((move) => {
      const reply = applyMove(afterDefense, move);
      return reply.outcome.status === "won" && reply.outcome.winner === "black";
    });

    expect(opponentCanWinImmediately).toBe(false);
  });

  it("keeps the exact enclosure defense in easy mode", () => {
    const state = placeMany(createGame(), [
      [8, 8, "black"],
      [8, 9, "black"],
      [9, 8, "black"],
      [9, 10, "white"],
    ]);
    const model = new ValueNetwork(12, new SeededRandom(19));
    const result = chooseMoveWithSearch(state, model, {
      difficulty: "easy",
      timeBudgetMs: 250,
      maxDepth: 1,
      seed: 23,
    });

    const afterDefense = applyMove(state, result.move);
    const opponentCanWinImmediately = listLegalMoves(afterDefense).some((move) => {
      const reply = applyMove(afterDefense, move);
      return reply.outcome.status === "won" && reply.outcome.winner === "black";
    });

    expect(opponentCanWinImmediately).toBe(false);
  });

  it("uses the same search policy for both display difficulties", () => {
    const state = createGame(3);
    const model = new ValueNetwork(12, new SeededRandom(29));
    const common = { timeBudgetMs: 100, maxDepth: 1, seed: 31 };
    const easy = chooseMoveWithSearch(state, model, {
      ...common,
      difficulty: "easy",
    });
    const hard = chooseMoveWithSearch(state, model, {
      ...common,
      difficulty: "hard",
    });

    expect(easy.move).toEqual(hard.move);
    expect(easy.score).toBe(hard.score);
  });
});
