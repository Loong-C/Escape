import { createGame, setPost, type GameState, type Player } from ".";

function placeMany(
  state: GameState,
  entries: Array<[number, number, Player]>,
): GameState {
  return entries.reduce(
    (current, [row, col, player]) => setPost(current, row, col, player),
    state,
  );
}

export function createHomeBoard(): GameState {
  return placeMany(createGame(), [
    [2, 2, "black"],
    [2, 3, "black"],
    [2, 4, "black"],
    [4, 6, "white"],
    [4, 7, "white"],
    [4, 8, "white"],
    [6, 9, "black"],
    [7, 9, "black"],
    [8, 9, "black"],
    [8, 4, "white"],
    [8, 5, "white"],
    [9, 5, "white"],
  ]);
}
