interface EscapeMarkProps {
  className?: string;
}

export function EscapeMark({ className }: EscapeMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 72 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 24V6h18M40 6h18v18M58 40v18H40M24 58H6V40"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle className="escape-mark__ball" cx="64" cy="32" r="6" />
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
