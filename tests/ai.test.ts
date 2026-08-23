import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  ValueNetwork,
  chooseMoveWithSearch,
  extractFeatures,
  strategicCandidates,
} from "../src/ai";
import { createGame, setPost, type GameState, type Player } from "../src/game";

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
    expect(features).toHaveLength(24);
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

  it("returns only legal strategic candidates", () => {
    const state = createGame();
    const candidates = strategicCandidates(state, 20, new SeededRandom(1));
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
});
