import { useState } from "react";
import type { AiDifficulty } from "./ai";
import { AppHeader } from "./components/AppHeader";
import { MatchScreen } from "./components/MatchScreen";
import { RulesDialog } from "./components/RulesDialog";
import { StartScreen } from "./components/StartScreen";
import { TutorialScreen } from "./components/TutorialScreen";

type Screen = "start" | "tutorial" | "match";

export function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [difficulty, setDifficulty] = useState<AiDifficulty>("easy");
  const [rulesOpen, setRulesOpen] = useState(false);

  const context = screen === "start" ? "逃脱" : screen === "tutorial" ? "新手教程" : "人机对战";

  return (
    <div className="app-shell">
      <AppHeader
        context={context}
        onRules={() => setRulesOpen(true)}
        onHome={screen === "start" ? undefined : () => setScreen("start")}
      />

      {screen === "start" && (
        <StartScreen
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onTutorial={() => setScreen("tutorial")}
          onMatch={() => setScreen("match")}
        />
      )}
      {screen === "tutorial" && (
        <TutorialScreen
          onHome={() => setScreen("start")}
          onStartMatch={(nextDifficulty) => {
            setDifficulty(nextDifficulty);
            setScreen("match");
          }}
        />
      )}
      {screen === "match" && (
        <MatchScreen
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onHome={() => setScreen("start")}
        />
      )}

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
