import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Phaser from "phaser";
import {
  getLegalMove,
  previewMove,
  type DirectionalDistances,
  type GameState,
  type Move,
  type Player,
} from "../game";
import {
  BOARD_CANVAS_SIZE,
  EscapeBoardScene,
  type BoardSceneView,
} from "../game/rendering/EscapeBoardScene";
import { BoardEdgeDistances } from "./BoardEdgeDistances";

export interface BoardDistanceHints {
  current: DirectionalDistances;
  after: DirectionalDistances | null;
}

export interface BoardCanvasProps {
  state: GameState;
  focusedMove: Move | null;
  tutorialTarget?: Move | null;
  goalPlayer?: Player;
  distanceHints?: BoardDistanceHints | null;
  highlightShortestDistances?: boolean;
  showBallMovePreview?: boolean;
  interactive: boolean;
  canSelect?: (move: Move) => boolean;
  onHover: (move: Move | null) => void;
  onSelect: (move: Move) => void;
}

function useDarkScheme(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return dark;
}

export function BoardCanvas({
  state,
  focusedMove,
  tutorialTarget = null,
  goalPlayer = state.turn,
  distanceHints = null,
  highlightShortestDistances = false,
  showBallMovePreview = false,
  interactive,
  canSelect,
  onHover,
  onSelect,
}: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<EscapeBoardScene | null>(null);
  const callbacksRef = useRef({ onHover, onSelect });
  const [keyboardFocus, setKeyboardFocus] = useState<Move | null>(null);
  const dark = useDarkScheme();
  callbacksRef.current = { onHover, onSelect };

  const selectable = useMemo(
    () =>
      canSelect ??
      ((move: Move) => interactive && getLegalMove(state, move) !== null),
    [canSelect, interactive, state],
  );
  const activeFocus = keyboardFocus ?? focusedMove;
  const movePreview = activeFocus ? previewMove(state, activeFocus) : null;

  useEffect(() => {
    if (!hostRef.current || gameRef.current) {
      return;
    }

    const scene = new EscapeBoardScene({
      onHover: (move) => callbacksRef.current.onHover(move),
      onSelect: (move) => callbacksRef.current.onSelect(move),
    });
    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: BOARD_CANVAS_SIZE,
      height: BOARD_CANVAS_SIZE,
      backgroundColor: "#f4f5f6",
      antialias: true,
      scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: BOARD_CANVAS_SIZE,
        height: BOARD_CANVAS_SIZE,
      },
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true,
      },
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view: BoardSceneView = {
      state,
      preview: movePreview,
      focusedMove: activeFocus,
      tutorialTarget,
      goalPlayer,
      showBallMovePreview,
      interactive,
      dark,
      canSelect: selectable,
    };
    sceneRef.current?.setView(view);
  }, [
    activeFocus,
    dark,
    goalPlayer,
    interactive,
    movePreview,
    selectable,
    showBallMovePreview,
    state,
    tutorialTarget,
  ]);

  const goalDescription =
    goalPlayer === "white" ? "玩家目标为左右边界" : "玩家目标为上下边界";
  const movementDescription =
    showBallMovePreview && movePreview?.ballWillMove
      ? `。确认后球将向${
          movePreview.ballWillMove === "up"
            ? "上"
            : movePreview.ballWillMove === "right"
              ? "右"
              : movePreview.ballWillMove === "down"
                ? "下"
                : "左"
        }移动一格`
      : "";

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (!interactive) {
      return;
    }
    const current = keyboardFocus ?? tutorialTarget ?? { row: 0, col: 0 };
    let next = current;
    if (event.key === "ArrowUp") next = { ...current, row: Math.max(0, current.row - 1) };
    if (event.key === "ArrowDown") {
      next = { ...current, row: Math.min(state.size, current.row + 1) };
    }
    if (event.key === "ArrowLeft") next = { ...current, col: Math.max(0, current.col - 1) };
    if (event.key === "ArrowRight") {
      next = { ...current, col: Math.min(state.size, current.col + 1) };
    }

    if (next !== current) {
      event.preventDefault();
      setKeyboardFocus(next);
      onHover(next);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && selectable(current)) {
      event.preventDefault();
      onSelect(current);
    }
  }

  return (
    <div
      className="board-shell"
      role="application"
      tabIndex={interactive ? 0 : -1}
      aria-label={
        interactive
          ? `Escape 棋盘。${goalDescription}。方向键选择交点，回车落桩。当前交点 ${(activeFocus?.row ?? 0) + 1} 行 ${(activeFocus?.col ?? 0) + 1} 列${movementDescription}。`
          : `Escape 棋盘。${goalDescription}。`
      }
      onKeyDown={handleKeyboard}
      onBlur={() => setKeyboardFocus(null)}
    >
      <div ref={hostRef} className="board-canvas" />
      {distanceHints && (
        <BoardEdgeDistances
          current={distanceHints.current}
          after={distanceHints.after}
          highlightShortest={highlightShortestDistances}
        />
      )}
    </div>
  );
}
