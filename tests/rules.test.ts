import { describe, expect, it } from "vitest";
import {
  adjudicateTurnStart,
  applyMove,
  createGame,
  getDirectionalExitDistances,
  getLegalMove,
  getNeighborEscapeDistances,
  getShortestEscapeInfo,
  getWallSegments,
  isAnchored,
  isPassageBlocked,
  previewMove,
  setPost,
  vertexIndex,
  type GameState,
  type Player,
} from "../src/game";

function placeMany(
  state: GameState,
  entries: Array<[row: number, col: number, player: Player]>,
): GameState {
  return entries.reduce(
    (current, [row, col, player]) => setPost(current, row, col, player),
    state,
  );
}

function rightCorridorState(ballCol = 2): GameState {
  let state = createGame(5);
  state = { ...state, ball: { row: 2, col: ballCol } };

  const entries: Array<[number, number, Player]> = [];
  for (let col = 0; col <= state.size; col += 1) {
    entries.push([0, col, "black"]);
    entries.push([state.size, col, "white"]);
  }
  for (let row = 1; row < state.size; row += 1) {
    entries.push([row, 0, "black"]);
  }
  return placeMany(state, entries);
}

describe("Escape rules engine", () => {
  it("starts an 11x11 board in the geometric center", () => {
    const state = createGame();
    expect(state.ball).toEqual({ row: 5, col: 5 });
    expect(state.posts).toHaveLength(144);
    expect(getDirectionalExitDistances(state)).toEqual({
      up: 6,
      right: 6,
      down: 6,
      left: 6,
    });
  });

  it("forms a wall between orthogonally adjacent same-color posts", () => {
    const state = placeMany(createGame(3), [
      [1, 1, "white"],
      [1, 2, "white"],
    ]);

    expect(getWallSegments(state)).toContainEqual({
      orientation: "horizontal",
      row: 1,
      col: 1,
      color: "white",
    });
    expect(isPassageBlocked(state, { row: 0, col: 1 }, "down")).toBe(true);
    expect(isPassageBlocked(state, { row: 1, col: 1 }, "up")).toBe(true);
  });

  it("distinguishes floating posts from anchored posts", () => {
    let state = setPost(createGame(3), 1, 1, "black");
    expect(isAnchored(state, 1, 1)).toBe(false);

    state = setPost(state, 1, 2, "black");
    expect(isAnchored(state, 1, 1)).toBe(true);
    expect(isAnchored(state, 1, 2)).toBe(true);
  });

  it("allows replacing an opponent floating post only when a wall forms", () => {
    let state = placeMany(createGame(3), [
      [2, 2, "black"],
      [2, 1, "white"],
    ]);
    const replacement = getLegalMove(state, { row: 2, col: 2 });
    expect(replacement).toEqual({ row: 2, col: 2, kind: "replace" });

    state = applyMove(state, { row: 2, col: 2 });
    expect(state.posts[vertexIndex(state.size, 2, 2)]).toBe("white");
    expect(getWallSegments(state)).toContainEqual({
      orientation: "horizontal",
      row: 2,
      col: 1,
      color: "white",
    });
  });

  it("does not allow replacing an anchored post", () => {
    const state = placeMany(createGame(3), [
      [1, 1, "black"],
      [1, 2, "black"],
      [2, 1, "white"],
    ]);
    expect(getLegalMove(state, { row: 1, col: 1 })).toBeNull();
  });

  it("keeps the ball still when shortest paths start in several directions", () => {
    const state = createGame(3);
    const next = applyMove(state, { row: 0, col: 0 });
    expect(next.ball).toEqual(state.ball);
    expect(next.lastMove?.shortestAfterPlacement.firstSteps).toEqual([
      "up",
      "right",
      "down",
      "left",
    ]);
  });

  it("moves the ball once when every shortest path has one first direction", () => {
    const state = rightCorridorState();
    expect(getShortestEscapeInfo(state).firstSteps).toEqual(["right"]);

    const next = applyMove(state, { row: 2, col: 3 });
    expect(next.ball).toEqual({ row: 2, col: 3 });
    expect(next.moveNumber).toBe(1);
  });

  it("counts the final boundary crossing and reports blocked directions as infinity", () => {
    const state = rightCorridorState();
    const distances = getDirectionalExitDistances(state);
    expect(distances.right).toBe(3);
    expect(distances.up).toBe(Number.POSITIVE_INFINITY);
    expect(distances.down).toBe(Number.POSITIVE_INFINITY);
    expect(distances.left).toBe(5);
  });

  it("reports shortest escape lengths from the four neighboring positions", () => {
    let state = placeMany(createGame(3), [
      [1, 1, "white"],
      [1, 2, "white"],
    ]);
    expect(getNeighborEscapeDistances(state)).toEqual({
      up: Number.POSITIVE_INFINITY,
      right: 1,
      down: 1,
      left: 1,
    });

    state = { ...createGame(3), ball: { row: 1, col: 2 } };
    expect(getNeighborEscapeDistances(state).right).toBe(0);
  });

  it("shows before and hypothetical after-placement lengths without drawing a path", () => {
    const state = createGame(3);
    const preview = previewMove(state, { row: 0, col: 0 });
    expect(preview?.before).toEqual({ up: 1, right: 1, down: 1, left: 1 });
    expect(preview?.afterPlacement).toEqual({
      up: 1,
      right: 1,
      down: 1,
      left: 1,
    });
  });

  it("awards a win to the player who traps the ball", () => {
    const state = placeMany(createGame(3), [
      [1, 1, "white"],
      [1, 2, "white"],
      [2, 1, "white"],
    ]);
    const next = applyMove(state, { row: 2, col: 2 });
    expect(next.outcome).toEqual({
      status: "won",
      winner: "white",
      reason: "trapped",
    });
    expect(next.ball).toEqual({ row: 1, col: 1 });
  });

  it("awards a boundary escape by direction, even when the other player moved", () => {
    const state = { ...rightCorridorState(4), turn: "black" as const };
    const next = applyMove(state, { row: 3, col: 3 });
    expect(next.outcome).toEqual({
      status: "won",
      winner: "white",
      reason: "escaped",
    });
    expect(next.lastMove?.escapedThrough).toBe("right");
    expect(next.lastMove?.ballAfter).toBeNull();
  });

  it("declares a draw when the player to move has no legal action", () => {
    const state = createGame(3);
    const full = {
      ...state,
      posts: state.posts.map(() => "white" as const),
    };
    expect(adjudicateTurnStart(full).outcome).toEqual({
      status: "draw",
      winner: null,
      reason: "no-legal-moves",
    });
  });
});
