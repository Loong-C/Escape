import {
  applyMove,
  createGame,
  STANDARD_BOARD_SIZE,
  setPost,
  type GameState,
  type Move,
  type MovePreview,
  type Player,
} from "../game";

const CENTER = Math.floor(STANDARD_BOARD_SIZE / 2);
const LAST_CELL = STANDARD_BOARD_SIZE - 1;

export const TUTORIAL_LABELS = [
  "放置桩",
  "形成墙",
  "替换浮桩",
  "最短路径长度",
  "推动球",
  "边界胜负",
  "封闭胜负",
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
  return {
    ...setPost(createGame(), 0, CENTER, "white"),
    ball: { row: 0, col: CENTER },
  };
}

function replacementLessonState(): GameState {
  return placeMany(createGame(), [
    [CENTER, CENTER - 1, "white"],
    [CENTER, CENTER, "black"],
  ]);
}

function movementLessonState(): GameState {
  let state = createGame();
  const entries: Array<[number, number, Player]> = [];
  for (let col = 0; col <= state.size; col += 1) {
    entries.push([state.size, col, "white"]);
  }
  for (let row = 0; row <= state.size; row += 1) {
    entries.push([row, 0, "white"]);
  }
  entries.push([CENTER, CENTER, "white"]);
  state = placeMany(state, entries);
  return state;
}

function boundaryWinLessonState(): GameState {
  return {
    ...setPost(createGame(), CENTER, LAST_CELL - 1, "black"),
    ball: { row: CENTER, col: LAST_CELL },
    turn: "black",
  };
}

function trappedWinLessonState(): GameState {
  return placeMany(createGame(), [
    [CENTER, CENTER, "white"],
    [CENTER, CENTER + 1, "white"],
    [CENTER + 1, CENTER, "white"],
  ]);
}

export function createTutorialLessons(): TutorialLesson[] {
  return [
    {
      label: "放置桩",
      title: "把桩放在交点上",
      description: "每回合必须放下一枚自己的桩，或按规则替换对方的浮桩。桩只能位于方格的交点。",
      instruction: "在蓝色标记处放下一枚白桩。",
      target: { row: CENTER, col: CENTER - 1 },
      initialState: createGame(),
      showDistances: false,
    },
    {
      label: "形成墙",
      title: "相邻的同色桩形成墙",
      description: "没有参与墙的桩叫浮桩。两个同色桩相邻后立即连成墙，两枚桩都成为锚桩。",
      instruction: "把第二枚白桩放在第一枚旁边。",
      target: { row: CENTER, col: CENTER },
      initialState: setPost(createGame(), CENTER, CENTER - 1, "white"),
      showDistances: false,
    },
    {
      label: "替换浮桩",
      title: "用自己的桩替换对方浮桩",
      description: "对方浮桩可以被替换，但替换后必须立刻与已有己方桩相邻并形成墙。已经参与墙的锚桩不能替换。",
      instruction: "选择黑色浮桩，用白桩替换它并与左侧白桩形成墙。",
      target: { row: CENTER, col: CENTER },
      initialState: replacementLessonState(),
      showDistances: false,
    },
    {
      label: "最短路径长度",
      title: "比较四个相邻位置的逃生长度",
      description: "数字直接写在球的四个相邻格中心，显示从该位置逃生的最短长度；预览落子时会直接切换为落子后的值。若墙挡住该方向，则显示 ∞。",
      instruction: "补上球上方的墙，观察上方数字变为 ∞；左右同为最小值，因此都不着色。",
      target: { row: 0, col: CENTER + 1 },
      initialState: distanceLessonState(),
      showDistances: true,
    },
    {
      label: "推动球",
      title: "唯一的最短首步推动球",
      description: "四个数字中只有一个最小值时，该数字会以强调色标出，球在确认落子后向这个方向移动一格。一次落桩最多推动一次。",
      instruction: "补成球上方的墙，让右侧成为唯一的最小值并观察数字着色。",
      target: { row: CENTER, col: CENTER + 1 },
      initialState: movementLessonState(),
      showDistances: true,
    },
    {
      label: "边界胜负",
      title: "球从哪条边出去，哪一方获胜",
      description: "左右边界属于白方，上下边界属于黑方。胜者由球离开的方向决定，不一定是最后落桩的人。",
      instruction: "黑方落桩后，观察球从右边界离开并判定白方获胜。",
      target: { row: CENTER, col: LAST_CELL },
      initialState: boundaryWinLessonState(),
      showDistances: true,
    },
    {
      label: "封闭胜负",
      title: "封住全部出口也能获胜",
      description: "如果一次落桩让球没有任何逃生路径，落下这枚桩的玩家立即获胜。",
      instruction: "补上最后一个角，让四面墙完全封住球。",
      target: { row: CENTER + 1, col: CENTER + 1 },
      initialState: trappedWinLessonState(),
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
