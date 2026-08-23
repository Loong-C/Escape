import { DIRECTIONS, type DirectionalDistances } from "../game";

interface DistancePanelProps {
  current: DirectionalDistances;
  after: DirectionalDistances | null;
  compact?: boolean;
}

const DIRECTION_LABELS = {
  up: "上",
  right: "右",
  down: "下",
  left: "左",
} as const;

function formatDistance(value: number | null): string {
  if (value === null) return "待选择";
  return Number.isFinite(value) ? String(value) : "∞";
}

export function DistancePanel({ current, after, compact = false }: DistancePanelProps) {
  return (
    <section className={`distance-panel${compact ? " distance-panel--compact" : ""}`}>
      <div className="section-heading">
        <h2>最短逃生距离</h2>
        <span>步数</span>
      </div>
      <div className="distance-grid" role="table" aria-live="polite">
        <div className="distance-grid__header" role="row">
          <span role="columnheader">方向</span>
          <span role="columnheader">当前</span>
          <span role="columnheader">落子后</span>
        </div>
        {DIRECTIONS.map((direction) => {
          const nextValue = after?.[direction] ?? null;
          const changed = after !== null && nextValue !== current[direction];
          return (
            <div className="distance-grid__row" role="row" key={direction}>
              <span role="cell">{DIRECTION_LABELS[direction]}</span>
              <strong role="cell">{formatDistance(current[direction])}</strong>
              <strong className={changed ? "distance-value--changed" : ""} role="cell">
                {formatDistance(nextValue)}
              </strong>
            </div>
          );
        })}
      </div>
      <p className="distance-note">越过边界的一步计入长度，∞ 表示无法从该方向离开。</p>
    </section>
  );
}
