import { ArrowClockwise, SignOut } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AiDifficulty, SearchResult } from "../ai";
import {
  applyMove,
  createGame,
  getDirectionalExitDistances,
  getLegalMove,
  previewMove,
  type Direction,
  type GameState,
  type Move,
  type Player,
} from "../game";
import { useAiWorker } from "../hooks/useAiWorker";
import { DifficultySwitch } from "./DifficultySwitch";
import { LazyBoardCanvas } from "./LazyBoardCanvas";

interface MatchScreenProps {
  difficulty: AiDifficulty;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onHome: () => void;
}

const PLAYER_NAMES: Record<Player, string> = { white: "白方", black: "黑方" };
const DIRECTION_NAMES: Record<Direction, string> = {
  up: "上",
  right: "右",
  down: "下",
  left: "左",
};

function randomHumanColor(): Player {
  return Math.random() < 0.5 ? "white" : "black";
}

function describeLastMove(state: GameState): string {
  const record = state.lastMove;
  if (!record) return "尚未落子";
  const action = record.move.kind === "replace" ? "替换" : "落桩";
  let detail = `${PLAYER_NAMES[record.player]}${action}于 (${record.move.row + 1}, ${record.move.col + 1})。`;
  if (record.escapedThrough) {
    detail += ` 球从${DIRECTION_NAMES[record.escapedThrough]}侧离开。`;
  } else if (
    record.ballAfter &&
    (record.ballAfter.row !== record.ballBefore.row ||
      record.ballAfter.col !== record.ballBefore.col)
  ) {
    const direction: Direction =
      record.ballAfter.row < record.ballBefore.row
        ? "up"
        : record.ballAfter.row > record.ballBefore.row
          ? "down"
          : record.ballAfter.col < record.ballBefore.col
            ? "left"
            : "right";
    detail += ` 球向${DIRECTION_NAMES[direction]}移动一格。`;
  }
  return detail;
}

export function MatchScreen({
  difficulty,
  onDifficultyChange,
  onHome,
}: MatchScreenProps) {
  const [state, setState] = useState(createGame);
  const [humanColor, setHumanColor] = useState<Player>(randomHumanColor);
  const [focusedMove, setFocusedMove] = useState<Move | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRetryToken, setAiRetryToken] = useState(0);
  const [searchStats, setSearchStats] = useState<
    (Omit<SearchResult, "move"> & { difficulty: AiDifficulty }) | null
  >(null);
  const pendingMoveNumber = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestAiMove = useAiWorker();
  const aiColor = humanColor === "white" ? "black" : "white";
  const humanTurn = state.outcome.status === "playing" && state.turn === humanColor;
  const coarsePointer = useMemo(
    () => window.matchMedia?.("(pointer: coarse)").matches ?? false,
    [],
  );

  useEffect(() => {
    if (
      state.outcome.status !== "playing" ||
      state.turn !== aiColor ||
      aiError !== null ||
      pendingMoveNumber.current === state.moveNumber
    ) {
      return;
    }

    const requestedMoveNumber = state.moveNumber;
    pendingMoveNumber.current = requestedMoveNumber;
    setAiThinking(true);
    setAiError(null);
    requestAiMove(state, difficulty)
      .then((result) => {
        const current = stateRef.current;
        if (
          current.moveNumber !== requestedMoveNumber ||
          current.outcome.status !== "playing" ||
          current.turn !== aiColor ||
          !getLegalMove(current, result.move)
        ) {
          return;
        }
        setSearchStats({ ...result.stats, difficulty });
        setState(applyMove(current, result.move));
      })
      .catch((error: Error) => {
        // React development mode remounts effects once. The replacement Worker
        // is already ready, so this expected teardown should retry silently.
        if (error.message === "AI Worker 已关闭") {
          setAiRetryToken((token) => token + 1);
        } else {
          setAiError(error.message);
        }
      })
      .finally(() => {
        if (pendingMoveNumber.current === requestedMoveNumber) {
          pendingMoveNumber.current = null;
        }
        setAiThinking(false);
      });
  }, [aiColor, aiError, aiRetryToken, difficulty, requestAiMove, state]);

  useEffect(() => {
    setFocusedMove(null);
  }, [state.moveNumber]);

  const currentDistances = getDirectionalExitDistances(state);
  const movePreview = focusedMove ? previewMove(state, focusedMove) : null;
  const distanceHints =
    difficulty === "easy"
      ? {
          current: movePreview?.before ?? currentDistances,
          after: movePreview?.afterPlacement ?? null,
        }
      : null;

  function commitMove(move: Move): void {
    if (!humanTurn || aiThinking || !getLegalMove(state, move)) return;
    setState((current) => applyMove(current, move));
    setFocusedMove(null);
  }

  function handleSelect(move: Move): void {
    if (coarsePointer && (focusedMove?.row !== move.row || focusedMove.col !== move.col)) {
      setFocusedMove(move);
      return;
    }
    commitMove(move);
  }

  function restart(): void {
    pendingMoveNumber.current = null;
    setState(createGame());
    setHumanColor(randomHumanColor());
    setFocusedMove(null);
    setAiError(null);
    setSearchStats(null);
  }

  function retryAiTurn(): void {
    pendingMoveNumber.current = null;
    setAiError(null);
  }

  const resultTitle =
    state.outcome.status === "draw"
      ? "和棋"
      : state.outcome.status === "won"
        ? state.outcome.winner === humanColor
          ? "你获胜"
          : "AI 获胜"
        : null;

  return (
    <main id="main-content" className="game-layout match-layout" tabIndex={-1}>
      <section className="playfield-region">
        <LazyBoardCanvas
          state={state}
          focusedMove={focusedMove}
          distanceHints={distanceHints}
          interactive={humanTurn && !aiThinking}
          canSelect={(move) => humanTurn && !aiThinking && getLegalMove(state, move) !== null}
          onHover={(move) => setFocusedMove(move)}
          onSelect={handleSelect}
        />
      </section>

      <aside className="side-rail match-rail">
        <section className="turn-section" aria-live="polite" aria-busy={aiThinking}>
          <div className="section-heading">
            <h1>当前回合</h1>
            <span>第 {state.moveNumber + 1} 回合</span>
          </div>
          <div className="turn-player">
            <i className={`player-piece player-piece--${state.turn}`} aria-hidden="true" />
            <div>
              <strong>{PLAYER_NAMES[state.turn]}</strong>
              <span>{state.turn === humanColor ? "你的回合" : aiThinking ? "AI 正在计算" : "AI 回合"}</span>
            </div>
          </div>
          <p className="role-note">你执{PLAYER_NAMES[humanColor]}，AI 执{PLAYER_NAMES[aiColor]}。</p>
        </section>

        <section className="match-difficulty">
          <div className="section-heading">
            <h2 id="match-difficulty-heading">难度</h2>
          </div>
          <DifficultySwitch
            value={difficulty}
            onChange={onDifficultyChange}
            labelledBy="match-difficulty-heading"
          />
        </section>

        {coarsePointer && focusedMove && movePreview && humanTurn && (
          <button className="primary-button mobile-confirm" type="button" onClick={() => commitMove(focusedMove)}>
            确认落桩
          </button>
        )}

        <section className="last-action">
          <div className="section-heading">
            <h2>上一步</h2>
          </div>
          <p>{describeLastMove(state)}</p>
          {difficulty === "hard" && searchStats?.difficulty === "hard" && (
            <span>AI 搜索深度 {searchStats.depth}，评估 {searchStats.nodes} 个节点</span>
          )}
        </section>

        {aiError && (
          <div className="inline-error" role="alert">
            <strong>AI 暂时无法行动</strong>
            <span>{aiError}</span>
            <button type="button" onClick={retryAiTurn}>重试本回合</button>
          </div>
        )}

        {resultTitle && (
          <section className="match-result" aria-live="assertive">
            <h2>{resultTitle}</h2>
            <p>
              {state.outcome.status === "draw"
                ? "当前玩家没有合法落子或替换位置。"
                : state.outcome.reason === "trapped"
                  ? "球已被完全封住。"
                  : "球已经越过目标边界。"}
            </p>
          </section>
        )}

        <div className="match-actions">
          <button className="primary-button" type="button" onClick={restart}>
            <ArrowClockwise aria-hidden="true" />
            重新开始
          </button>
          <button className="secondary-button" type="button" onClick={onHome}>
            <SignOut aria-hidden="true" />
            退出对局
          </button>
        </div>
      </aside>
    </main>
  );
}
