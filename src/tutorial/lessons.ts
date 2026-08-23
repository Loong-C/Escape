import {
  applyMove,
  createGame,
  setPost,
  type GameState,
  type Move,
  type MovePreview,
  type Player,
} from "../game";

export const TUTORIAL_LABELS = [
  "放置桩",
  "形成墙",
  "最短路径长度",
  "完成练习",
] as const;

export interface TutorialLesson {
  label: (typeof TUTORIAL_LABELS)[number];
  title: string;
  description: string;
  instruction: string;
  target: Move;
  initialState: GameState;
  showDistances: boolean;
}

function placeMany(
  state: GameState,
  entries: Array<[row: number, col: number, player: Player]>,
): GameState {
  return entries.reduce(
    (current, [row, col, player]) => setPost(current, row, col, player),
    state,
  );
}

function distanceLessonState(): GameState {
  return setPost(createGame(), 5, 5, "white");
}

function movementLessonState(): GameState {
  let state = createGame();
  const entries: Array<[number, number, Player]> = [];
  for (let col = 0; col <= state.size; col += 1) {
    entries.push([0, col, "black"]);
    entries.push([state.size, col, "white"]);
  }
  for (let row = 1; row < state.size; row += 1) {
    entries.push([row, 0, "black"]);
  }
  state = placeMany(state, entries);
  return state;
}

export function createTutorialLessons(): TutorialLesson[] {
  return [
    {
      label: "放置桩",
      title: "把桩放在交点上",
      description: "每回合必须放下一枚自己的桩，或按规则替换对方的浮桩。桩只能位于方格的交点。",
      instruction: "在蓝色标记处放下一枚白桩。",
      target: { row: 5, col: 4 },
      initialState: createGame(),
      showDistances: false,
    },
    {
      label: "形成墙",
      title: "相邻的同色桩形成墙",
      description: "没有参与墙的桩叫浮桩。两个同色桩相邻后立即连成墙，两枚桩都成为锚桩。",
      instruction: "把第二枚白桩放在第一枚旁边。",
      target: { row: 5, col: 5 },
      initialState: setPost(createGame(), 5, 4, "white"),
      showDistances: false,
    },
    {
      label: "最短路径长度",
      title: "比较四个出口的最少步数",
      description: "上、右、下、左四个数字包含最后越界的一步。无法到达时显示 ∞，这里只显示长度，不显示具体路线。",
      instruction: "将指针移到蓝色交点，比较落子前后的数字，然后落桩。",
      target: { row: 5, col: 6 },
      initialState: distanceLessonState(),
      showDistances: true,
    },
    {
      label: "完成练习",
      title: "唯一的最短首步推动球",
      description: "如果全部最短逃生路线的第一步相同，球向该方向移动一格。一次落桩最多推动一次。",
      instruction: "完成这次落桩，观察球向右移动一格。",
      target: { row: 6, col: 7 },
      initialState: movementLessonState(),
      showDistances: true,
    },
  ];
}

export interface TutorialMoveResult {
  state: GameState;
  preview: MovePreview;
}

export function completeTutorialMove(
  lesson: TutorialLesson,
  state: GameState,
  move: Move,
  preview: MovePreview | null,
): TutorialMoveResult | null {
  if (
    move.row !== lesson.target.row ||
    move.col !== lesson.target.col ||
    preview === null
  ) {
    return null;
  }
  return { state: applyMove(state, move), preview };
}
