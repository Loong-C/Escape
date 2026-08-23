import type { AiDifficulty } from "../ai";
import { createHomeBoard } from "../game/presets";
import { LazyBoardCanvas } from "./LazyBoardCanvas";
import { DifficultySwitch } from "./DifficultySwitch";

interface StartScreenProps {
  difficulty: AiDifficulty;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onTutorial: () => void;
  onMatch: () => void;
}

const HOME_BOARD = createHomeBoard();

export function StartScreen({
  difficulty,
  onDifficultyChange,
  onTutorial,
  onMatch,
}: StartScreenProps) {
  return (
    <main className="game-layout start-layout">
      <section className="playfield-region" aria-label="游戏棋盘预览">
        <LazyBoardCanvas
          state={HOME_BOARD}
          focusedMove={null}
          interactive={false}
          onHover={() => undefined}
          onSelect={() => undefined}
        />
      </section>
      <aside className="side-rail start-rail">
        <div>
          <h1>控制最短距离，让球逃脱</h1>
          <p className="lead-copy">放置桩，连接墙，改变球通往四条边界的最少步数。</p>
        </div>

        <section className="start-options">
          <div className="section-heading">
            <h2 id="difficulty-heading">难度</h2>
          </div>
          <DifficultySwitch
            value={difficulty}
            onChange={onDifficultyChange}
            labelledBy="difficulty-heading"
          />
          <p className="option-note">
            {difficulty === "easy"
              ? "显示落子前后的四方向最短距离，AI 使用标准搜索。"
              : "隐藏距离提示，AI 使用更深的树搜索。"}
          </p>
        </section>

        <div className="start-actions">
          <button className="primary-button" type="button" onClick={onMatch}>
            开始人机对战
          </button>
          <button className="secondary-button" type="button" onClick={onTutorial}>
            新手教程
          </button>
        </div>
      </aside>
    </main>
  );
}
