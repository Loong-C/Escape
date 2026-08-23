import { describe, expect, it } from "vitest";
import { previewMove } from "../src/game";
import { completeTutorialMove, createTutorialLessons } from "../src/tutorial/lessons";

describe("Escape tutorial outcomes", () => {
  it("teaches that a right-edge escape awards white even after black moves", () => {
    const lesson = createTutorialLessons()[4];
    const preview = previewMove(lesson.initialState, lesson.target);
    const result = completeTutorialMove(
      lesson,
      lesson.initialState,
      lesson.target,
      preview,
    );

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

    expect(preview?.wouldTrap).toBe(true);
    expect(result?.state.outcome).toEqual({
      status: "won",
      winner: "white",
      reason: "trapped",
    });
  });
});
