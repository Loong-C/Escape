interface EscapeMarkProps {
  className?: string;
}

export function EscapeMark({ className }: EscapeMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 82 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 24V6h19M41 6h19v18M60 40v18H41M25 58H6V40"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <g className="escape-mark__motion">
        <rect x="44" y="23" width="18" height="4" rx="2" />
        <rect x="34" y="30" width="30" height="4" rx="2" />
        <rect x="46" y="37" width="16" height="4" rx="2" />
      </g>
      <circle className="escape-mark__ball" cx="72" cy="32" r="8" />
    </svg>
  );
}

export function EscapeLogo() {
  return (
    <div className="escape-logo" data-escape-logo="hero" aria-label="Escape">
      <EscapeMark className="escape-logo__mark" />
      <strong aria-hidden="true">ESCAPE</strong>
    </div>
  );
}
