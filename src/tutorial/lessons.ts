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
    ...setPost(createGame(), 0, 5, "white"),
    ball: { row: 0, col: 5 },
  };
}

function replacementLessonState(): GameState {
  return placeMany(createGame(), [
    [5, 4, "white"],
    [5, 5, "black"],
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
  entries.push([5, 5, "white"]);
  state = placeMany(state, entries);
  return state;
}

function boundaryWinLessonState(): GameState {
  return {
    ...setPost(createGame(), 5, 9, "black"),
    ball: { row: 5, col: 10 },
    turn: "black",
  };
}

function trappedWinLessonState(): GameState {
  return placeMany(createGame(), [
    [5, 5, "white"],
    [5, 6, "white"],
    [6, 5, "white"],
  ]);
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
      label: "替换浮桩",
      title: "用自己的桩替换对方浮桩",
      description: "对方浮桩可以被替换，但替换后必须立刻与已有己方桩相邻并形成墙。已经参与墙的锚桩不能替换。",
      instruction: "选择黑色浮桩，用白桩替换它并与左侧白桩形成墙。",
      target: { row: 5, col: 5 },
      initialState: replacementLessonState(),
      showDistances: false,
    },
    {
      label: "最短路径长度",
      title: "比较四个相邻位置的逃生长度",
      description: "数字显示球向上、右、下、左移动一步后，所在位置的最短逃生路径长度；最后越界的一步计入长度。若墙挡住该方向，则显示 ∞。",
      instruction: "补上球上方的墙，观察上方相邻位置从 0 变为 ∞。",
      target: { row: 0, col: 6 },
      initialState: distanceLessonState(),
      showDistances: true,
    },
    {
      label: "推动球",
      title: "唯一的最短首步推动球",
      description: "如果全部最短逃生路线的第一步相同，球向该方向移动一格。一次落桩最多推动一次。",
      instruction: "补成球上方的墙，让右侧成为唯一的最短首步。",
      target: { row: 5, col: 6 },
      initialState: movementLessonState(),
      showDistances: true,
    },
    {
      label: "边界胜负",
      title: "球从哪条边出去，哪一方获胜",
      description: "左右边界属于白方，上下边界属于黑方。胜者由球离开的方向决定，不一定是最后落桩的人。",
      instruction: "黑方落桩后，观察球从右边界离开并判定白方获胜。",
      target: { row: 5, col: 10 },
      initialState: boundaryWinLessonState(),
      showDistances: true,
    },
    {
      label: "封闭胜负",
      title: "封住全部出口也能获胜",
      description: "如果一次落桩让球没有任何逃生路径，落下这枚桩的玩家立即获胜。",
      instruction: "补上最后一个角，让四面墙完全封住球。",
      target: { row: 6, col: 6 },
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
