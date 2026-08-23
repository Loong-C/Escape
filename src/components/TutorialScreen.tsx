import { useMemo, useState } from "react";
import type { AiDifficulty } from "../ai";
import { getDirectionalExitDistances, previewMove, type Move, type MovePreview } from "../game";
import {
  TUTORIAL_LABELS,
  completeTutorialMove,
  createTutorialLessons,
} from "../tutorial/lessons";
import { LazyBoardCanvas } from "./LazyBoardCanvas";

interface TutorialScreenProps {
  onHome: () => void;
  onStartMatch: (difficulty: AiDifficulty) => void;
}

const SUCCESS_MESSAGES = [
  "这枚桩尚未连接墙，所以它是浮桩。",
  "墙已经形成，两枚白桩现在都是锚桩。",
  "墙挡住了直接向上的出口，上边距离从 1 变为 2；两个同长首步并存，所以球没有移动。",
  "新墙让上边距离变长，右侧成为唯一的最短首步，球按规则只移动了一格。",
  "球从右边界离开。左右边界属于白方，所以这一局由白方获胜。",
  "四面墙已经封闭。落下最后一枚桩的白方立即获胜。",
] as const;

export function TutorialScreen({ onHome, onStartMatch }: TutorialScreenProps) {
  const lessons = useMemo(createTutorialLessons, []);
  const [lessonIndex, setLessonIndex] = useState(0);
  const lesson = lessons[lessonIndex];
  const [state, setState] = useState(lesson.initialState);
  const [focusedMove, setFocusedMove] = useState<Move | null>(null);
  const [completed, setCompleted] = useState(false);
  const [completionPreview, setCompletionPreview] = useState<MovePreview | null>(null);

  function handleSelect(move: Move): void {
    if (completed) return;
    const movePreview = previewMove(state, move);
    const result = completeTutorialMove(lesson, state, move, movePreview);
    if (!result) return;
    setState(result.state);
    setCompletionPreview(result.preview);
    setFocusedMove(null);
    setCompleted(true);
  }

  function continueTutorial(): void {
    if (!completed) return;
    if (lessonIndex === lessons.length - 1) {
      onStartMatch("easy");
      return;
    }
    const nextIndex = lessonIndex + 1;
    setLessonIndex(nextIndex);
    setState(lessons[nextIndex].initialState);
    setFocusedMove(null);
    setCompleted(false);
    setCompletionPreview(null);
  }

  const boardFocus = lesson.showDistances ? lesson.target : focusedMove;
  const tutorialDistances =
    completed && completionPreview
      ? completionPreview.afterPlacement
      : getDirectionalExitDistances(state);

  return (
    <main id="main-content" className="game-layout tutorial-layout" tabIndex={-1}>
      <section className="playfield-region">
        <LazyBoardCanvas
          state={state}
          focusedMove={boardFocus}
          tutorialTarget={lesson.target}
          goalPlayer={lesson.initialState.turn}
          distanceHints={
            lesson.showDistances
              ? {
                  current: tutorialDistances,
                  after: null,
                }
              : null
          }
          highlightShortestDistances={lesson.showDistances}
          showBallMovePreview={lessonIndex === 3 && !completed}
          interactive={!completed}
          canSelect={(move) =>
            !completed && move.row === lesson.target.row && move.col === lesson.target.col
          }
          onHover={(move) => setFocusedMove(move)}
          onSelect={handleSelect}
        />
      </section>

      <aside className="side-rail tutorial-rail">
        <div className="tutorial-heading-row">
          <span>{lesson.label}</span>
          <strong>{lessonIndex + 1} / {lessons.length}</strong>
        </div>
        <div className="tutorial-copy">
          <h1>{lesson.title}</h1>
          <p>{lesson.description}</p>
          <p className="tutorial-instruction">{lesson.instruction}</p>
        </div>

        {lessonIndex === 1 && (
          <div className="post-legend" aria-label="桩的状态图例">
            <span><i className="post-symbol post-symbol--float" />浮桩</span>
            <span><i className="post-symbol post-symbol--anchor" />锚桩</span>
          </div>
        )}

        <div className="tutorial-feedback" aria-live="polite">
          {completed ? SUCCESS_MESSAGES[lessonIndex] : "完成棋盘上的蓝色目标后继续。"}
        </div>

        <div className="tutorial-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!completed}
            onClick={continueTutorial}
          >
            {lessonIndex === lessons.length - 1 ? "开始人机对战" : "继续"}
          </button>
          <button className="secondary-button" type="button" onClick={onHome}>
            退出教程
          </button>
        </div>

        <ol className="tutorial-progress" aria-label="教程进度">
          {TUTORIAL_LABELS.map((label, index) => (
            <li
              key={label}
              className={index <= lessonIndex ? "is-active" : ""}
              aria-current={index === lessonIndex ? "step" : undefined}
            >
              <span aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
