import type { AiDifficulty } from "../ai";

interface DifficultySwitchProps {
  value: AiDifficulty;
  onChange: (difficulty: AiDifficulty) => void;
  labelledBy?: string;
}

export function DifficultySwitch({ value, onChange, labelledBy }: DifficultySwitchProps) {
  return (
    <div className="difficulty-switch" role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        aria-pressed={value === "easy"}
        onClick={() => onChange("easy")}
      >
        简单
      </button>
      <button
        type="button"
        aria-pressed={value === "hard"}
        onClick={() => onChange("hard")}
      >
        困难
      </button>
    </div>
  );
}
