import { BookOpen, House } from "@phosphor-icons/react";
import { EscapeMark } from "./EscapeLogo";

interface AppHeaderProps {
  context: string;
  onRules: () => void;
  onHome?: () => void;
}

export function AppHeader({ context, onRules, onHome }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="Escape 逃脱">
        <EscapeMark className="brand-mark" />
        <strong>ESCAPE</strong>
        <span aria-hidden="true" />
        <em>{context}</em>
      </div>
      <nav aria-label="应用操作">
        {onHome && (
          <button className="header-action" type="button" onClick={onHome}>
            <House aria-hidden="true" weight="regular" />
            主页
          </button>
        )}
        <button className="header-action" type="button" onClick={onRules}>
          <BookOpen aria-hidden="true" weight="regular" />
          规则
        </button>
      </nav>
    </header>
  );
}
