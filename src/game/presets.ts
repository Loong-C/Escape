import {
  STANDARD_BOARD_SIZE,
  createGame,
  setPost,
  type GameState,
  type Player,
} from ".";

const CENTER = Math.floor(STANDARD_BOARD_SIZE / 2);

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
    [CENTER - 4, CENTER - 4, "black"],
    [CENTER - 4, CENTER - 3, "black"],
    [CENTER - 4, CENTER - 2, "black"],
    [CENTER - 2, CENTER + 2, "white"],
    [CENTER - 2, CENTER + 3, "white"],
    [CENTER - 2, CENTER + 4, "white"],
    [CENTER + 2, CENTER + 5, "black"],
    [CENTER + 3, CENTER + 5, "black"],
    [CENTER + 4, CENTER + 5, "black"],
    [CENTER + 4, CENTER - 2, "white"],
    [CENTER + 4, CENTER - 1, "white"],
    [CENTER + 5, CENTER - 1, "white"],
  ]);
}
