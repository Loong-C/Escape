import type { AiDifficulty } from "../ai";
import { createHomeBoard } from "../game/presets";
import { LazyBoardCanvas } from "./LazyBoardCanvas";
import { DifficultySwitch } from "./DifficultySwitch";
import { EscapeLogo } from "./EscapeLogo";

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
    <main id="main-content" className="game-layout start-layout" tabIndex={-1}>
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
        <EscapeLogo />

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
              ? "显示棋盘外的四边距离提示。"
              : "不显示距离与移动预览，AI 强度与简易模式相同。"}
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
