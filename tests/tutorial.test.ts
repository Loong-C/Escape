import { describe, expect, it } from "vitest";
import { getWallSegments, previewMove } from "../src/game";
import { completeTutorialMove, createTutorialLessons } from "../src/tutorial/lessons";

describe("Escape tutorial outcomes", () => {
  it("uses an effective distance example on the standard board", () => {
    const lesson = createTutorialLessons()[2];
    const preview = previewMove(lesson.initialState, lesson.target);

    expect(lesson.initialState.size).toBe(11);
    expect(preview?.before.up).toBe(1);
    expect(preview?.afterPlacement.up).toBe(2);
    expect(preview?.ballWillMove).toBeNull();
    expect(
      Object.entries(preview?.afterPlacement ?? {}).filter(
        ([direction, distance]) =>
          distance !== preview?.before[direction as keyof typeof preview.before],
      ),
    ).toEqual([["up", 2]]);
  });

  it("forms a wall that leaves one shortest first step", () => {
    const lesson = createTutorialLessons()[3];
    const preview = previewMove(lesson.initialState, lesson.target);
    const result = completeTutorialMove(
      lesson,
      lesson.initialState,
      lesson.target,
      preview,
    );

    expect(lesson.initialState.size).toBe(11);
    expect(preview?.before.up).toBe(preview?.before.right);
    expect(preview?.afterPlacement.up).toBeGreaterThan(
      preview?.afterPlacement.right ?? Number.POSITIVE_INFINITY,
    );
    expect(preview?.shortestAfterPlacement.firstSteps).toEqual(["right"]);
    expect(result?.state.ball).toEqual({ row: 5, col: 6 });
    expect(getWallSegments(result!.state)).toContainEqual({
      orientation: "horizontal",
      row: 5,
      col: 5,
      color: "white",
    });
  });

  it("teaches that a right-edge escape awards white even after black moves", () => {
    const lesson = createTutorialLessons()[4];
    const preview = previewMove(lesson.initialState, lesson.target);
    const result = completeTutorialMove(
      lesson,
      lesson.initialState,
      lesson.target,
      preview,
    );

    expect(lesson.initialState.size).toBe(11);
    expect(result?.state.outcome).toEqual({
      status: "won",
      winner: "white",
      reason: "escaped",
    });
    expect(result?.state.lastMove?.escapedThrough).toBe("right");
  });

  it("teaches that the player placing the final enclosing wall wins", () => {
    const lesson = createTutorialLessons()[5];
    const preview = previewMove(lesson.initialState, lesson.target);
    const result = completeTutorialMove(
      lesson,
      lesson.initialState,
      lesson.target,
      preview,
    );

    expect(lesson.initialState.size).toBe(11);
    expect(preview?.wouldTrap).toBe(true);
    expect(result?.state.outcome).toEqual({
      status: "won",
      winner: "white",
      reason: "trapped",
    });
  });
});
