import * as Phaser from "phaser";
import {
  getPost,
  getWallSegments,
  type GameState,
  type Move,
  type MovePreview,
  type Player,
} from "..";

export interface BoardSceneView {
  state: GameState;
  preview: MovePreview | null;
  focusedMove: Move | null;
  tutorialTarget: Move | null;
  interactive: boolean;
  dark: boolean;
  canSelect: (move: Move) => boolean;
}

interface BoardSceneCallbacks {
  onHover: (move: Move | null) => void;
  onSelect: (move: Move) => void;
}

const CANVAS_SIZE = 1_000;
const BOARD_MARGIN = 72;
const BOARD_LENGTH = CANVAS_SIZE - BOARD_MARGIN * 2;

const LIGHT_COLORS = {
  background: 0xf4f5f6,
  board: 0xf9fafb,
  grid: 0xd8dbe0,
  boundary: 0x8d949d,
  emptyPoint: 0x858c95,
  black: 0x191c20,
  white: 0xf7f8f9,
  whiteOutline: 0x7a818a,
  whiteWallOutline: 0xa8aeb6,
  accent: 0x2f63d8,
} as const;

const DARK_COLORS = {
  background: 0x17191c,
  board: 0x202328,
  grid: 0x383d44,
  boundary: 0x737b85,
  emptyPoint: 0x8e959e,
  black: 0x08090a,
  white: 0xf0f2f4,
  whiteOutline: 0xc8ccd1,
  whiteWallOutline: 0x9aa1aa,
  accent: 0x6d96ef,
} as const;

export class EscapeBoardScene extends Phaser.Scene {
  private view: BoardSceneView | null = null;
  private callbacks: BoardSceneCallbacks;

  constructor(callbacks: BoardSceneCallbacks) {
    super({ key: "escape-board" });
    this.callbacks = callbacks;
  }

  create(): void {
    this.renderBoard();
  }

  setView(view: BoardSceneView): void {
    this.view = view;
    if (this.sys.isActive()) {
      this.renderBoard();
    }
  }

  private point(size: number, row: number, col: number): Phaser.Math.Vector2 {
    const step = BOARD_LENGTH / size;
    return new Phaser.Math.Vector2(
      BOARD_MARGIN + col * step,
      BOARD_MARGIN + row * step,
    );
  }

  private renderBoard(): void {
    this.children.removeAll(true);
    if (!this.view) {
      return;
    }

    const { state } = this.view;
    const colors = this.view.dark ? DARK_COLORS : LIGHT_COLORS;
    const graphics = this.add.graphics();

    graphics.fillStyle(colors.background, 1);
    graphics.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    graphics.fillStyle(colors.board, 1);
    graphics.fillRect(
      BOARD_MARGIN - 22,
      BOARD_MARGIN - 22,
      BOARD_LENGTH + 44,
      BOARD_LENGTH + 44,
    );

    graphics.lineStyle(1, colors.grid, 1);
    for (let index = 0; index <= state.size; index += 1) {
      const startHorizontal = this.point(state.size, index, 0);
      const endHorizontal = this.point(state.size, index, state.size);
      graphics.lineBetween(
        startHorizontal.x,
        startHorizontal.y,
        endHorizontal.x,
        endHorizontal.y,
      );

      const startVertical = this.point(state.size, 0, index);
      const endVertical = this.point(state.size, state.size, index);
      graphics.lineBetween(
        startVertical.x,
        startVertical.y,
        endVertical.x,
        endVertical.y,
      );
    }

    graphics.lineStyle(2, colors.boundary, 1);
    graphics.strokeRect(BOARD_MARGIN, BOARD_MARGIN, BOARD_LENGTH, BOARD_LENGTH);

    for (const wall of getWallSegments(state)) {
      const start = this.point(state.size, wall.row, wall.col);
      const end = this.point(
        state.size,
        wall.row + (wall.orientation === "vertical" ? 1 : 0),
        wall.col + (wall.orientation === "horizontal" ? 1 : 0),
      );
      if (wall.color === "white") {
        graphics.lineStyle(11, colors.whiteWallOutline, 1);
        graphics.lineBetween(start.x, start.y, end.x, end.y);
        graphics.lineStyle(7, colors.white, 1);
      } else {
        graphics.lineStyle(9, colors.black, 1);
      }
      graphics.lineBetween(start.x, start.y, end.x, end.y);
    }

    this.drawPreviewWalls(graphics, colors.accent);

    for (let row = 0; row <= state.size; row += 1) {
      for (let col = 0; col <= state.size; col += 1) {
        const point = this.point(state.size, row, col);
        const post = getPost(state, row, col);
        if (post) {
          this.drawPost(graphics, point, post, colors);
        } else {
          graphics.fillStyle(colors.board, 1);
          graphics.fillCircle(point.x, point.y, 4);
          graphics.lineStyle(1.5, colors.emptyPoint, 1);
          graphics.strokeCircle(point.x, point.y, 4);
        }
      }
    }

    if (!(state.outcome.status === "won" && state.outcome.reason === "escaped")) {
      const ballPoint = new Phaser.Math.Vector2(
        BOARD_MARGIN + (state.ball.col + 0.5) * (BOARD_LENGTH / state.size),
        BOARD_MARGIN + (state.ball.row + 0.5) * (BOARD_LENGTH / state.size),
      );
      graphics.fillStyle(colors.accent, 1);
      graphics.fillCircle(ballPoint.x, ballPoint.y, 15);
      graphics.lineStyle(3, this.view.dark ? 0x202328 : 0xffffff, 0.9);
      graphics.strokeCircle(ballPoint.x, ballPoint.y, 15);
    }

    if (state.lastMove) {
      const last = this.point(state.size, state.lastMove.move.row, state.lastMove.move.col);
      graphics.lineStyle(2, colors.accent, 0.45);
      graphics.strokeCircle(last.x, last.y, 17);
    }

    const focused = this.view.focusedMove ?? this.view.tutorialTarget;
    if (focused) {
      const focusPoint = this.point(state.size, focused.row, focused.col);
      graphics.lineStyle(3, colors.accent, 1);
      graphics.strokeCircle(focusPoint.x, focusPoint.y, 18);
      if (this.view.preview) {
        graphics.fillStyle(colors.accent, 0.28);
        graphics.fillCircle(focusPoint.x, focusPoint.y, 10);
      }
    }

    if (this.view.interactive) {
      this.addInteractionZones();
    }
  }

  private drawPost(
    graphics: Phaser.GameObjects.Graphics,
    point: Phaser.Math.Vector2,
    post: Player,
    colors: typeof LIGHT_COLORS | typeof DARK_COLORS,
  ): void {
    if (post === "white") {
      graphics.fillStyle(colors.white, 1);
      graphics.fillCircle(point.x, point.y, 10);
      graphics.lineStyle(2, colors.whiteOutline, 1);
      graphics.strokeCircle(point.x, point.y, 10);
    } else {
      graphics.fillStyle(colors.black, 1);
      graphics.fillCircle(point.x, point.y, 10);
      graphics.lineStyle(1.5, this.view?.dark ? 0x777f89 : 0x0b0d0f, 1);
      graphics.strokeCircle(point.x, point.y, 10);
    }
  }

  private drawPreviewWalls(
    graphics: Phaser.GameObjects.Graphics,
    accent: number,
  ): void {
    if (!this.view?.preview || !this.view.focusedMove) {
      return;
    }

    const { state, focusedMove } = this.view;
    const neighbors = [
      { row: focusedMove.row - 1, col: focusedMove.col },
      { row: focusedMove.row + 1, col: focusedMove.col },
      { row: focusedMove.row, col: focusedMove.col - 1 },
      { row: focusedMove.row, col: focusedMove.col + 1 },
    ];
    const start = this.point(state.size, focusedMove.row, focusedMove.col);
    graphics.lineStyle(8, accent, 0.34);
    for (const neighbor of neighbors) {
      if (getPost(state, neighbor.row, neighbor.col) === state.turn) {
        const end = this.point(state.size, neighbor.row, neighbor.col);
        graphics.lineBetween(start.x, start.y, end.x, end.y);
      }
    }
  }

  private addInteractionZones(): void {
    if (!this.view) {
      return;
    }
    const { state } = this.view;
    const step = BOARD_LENGTH / state.size;
    const hitSize = Math.max(44, step * 0.92);

    for (let row = 0; row <= state.size; row += 1) {
      for (let col = 0; col <= state.size; col += 1) {
        const move = { row, col };
        if (!this.view.canSelect(move)) {
          continue;
        }
        const point = this.point(state.size, row, col);
        const zone = this.add
          .zone(point.x, point.y, hitSize, hitSize)
          .setInteractive({ cursor: "pointer" });
        zone.on("pointerover", () => this.callbacks.onHover(move));
        zone.on("pointerout", () => this.callbacks.onHover(null));
        zone.on("pointerdown", () => this.callbacks.onSelect(move));
      }
    }
  }
}

export const BOARD_CANVAS_SIZE = CANVAS_SIZE;
