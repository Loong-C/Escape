import { useMemo, useState } from "react";
import type { AiDifficulty } from "../ai";
import { getDirectionalExitDistances, previewMove, type Move, type MovePreview } from "../game";
import {
  TUTORIAL_LABELS,
  completeTutorialMove,
  createTutorialLessons,
} from "../tutorial/lessons";
import { LazyBoardCanvas } from "./LazyBoardCanvas";
import { DistancePanel } from "./DistancePanel";

interface TutorialScreenProps {
  onHome: () => void;
  onStartMatch: (difficulty: AiDifficulty) => void;
}

const SUCCESS_MESSAGES = [
  "这枚桩尚未连接墙，所以它是浮桩。",
  "墙已经形成，两枚白桩现在都是锚桩。",
  "落子改变了上方出口的最短距离，球仍有多个同长首步，所以没有移动。",
  "全部最短路线从右侧开始，球按规则只移动了一格。",
] as const;

export function TutorialScreen({ onHome, onStartMatch }: TutorialScreenProps) {
  const lessons = useMemo(createTutorialLessons, []);
  const [lessonIndex, setLessonIndex] = useState(0);
  const lesson = lessons[lessonIndex];
  const [state, setState] = useState(lesson.initialState);
  const [focusedMove, setFocusedMove] = useState<Move | null>(null);
  const [completed, setCompleted] = useState(false);
  const [completionPreview, setCompletionPreview] = useState<MovePreview | null>(null);

  const livePreview = previewMove(state, lesson.target);
  const displayedPreview = completionPreview ?? livePreview;

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
  const currentDistances = displayedPreview?.before ?? getDirectionalExitDistances(state);

  return (
    <main className="game-layout tutorial-layout">
      <section className="playfield-region">
        <LazyBoardCanvas
          state={state}
          focusedMove={boardFocus}
          tutorialTarget={lesson.target}
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

        {lesson.showDistances && displayedPreview && (
          <DistancePanel
            current={currentDistances}
            after={displayedPreview.afterPlacement}
            compact
          />
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
