import { lazy, Suspense } from "react";
import type { BoardCanvasProps } from "./BoardCanvas";

const BoardCanvas = lazy(() =>
  import("./BoardCanvas").then((module) => ({ default: module.BoardCanvas })),
);

export function LazyBoardCanvas(props: BoardCanvasProps) {
  return (
    <Suspense
      fallback={
        <div className="board-shell board-loading" role="status">
          <span>正在准备棋盘</span>
        </div>
      }
    >
      <BoardCanvas {...props} />
    </Suspense>
  );
}
