export const DIRECTIONS = ["up", "right", "down", "left"] as const;

export type Direction = (typeof DIRECTIONS)[number];
export type Player = "white" | "black";
export type Post = Player | null;
export type MoveKind = "place" | "replace";

export interface Cell {
  row: number;
  col: number;
}

export interface Move {
  row: number;
  col: number;
}

export interface LegalMove extends Move {
  kind: MoveKind;
}

export interface DirectionalDistances {
  up: number;
  right: number;
  down: number;
  left: number;
}

export interface ShortestEscapeInfo {
  distance: number;
  firstSteps: Direction[];
}

export interface WallSegment {
  orientation: "horizontal" | "vertical";
  row: number;
  col: number;
  color: Player;
}

export type WinReason = "escaped" | "trapped";

export type GameOutcome =
  | { status: "playing"; winner: null; reason: null }
  | { status: "draw"; winner: null; reason: "no-legal-moves" }
  | { status: "won"; winner: Player; reason: WinReason };

export interface MoveRecord {
  player: Player;
  move: LegalMove;
  ballBefore: Cell;
  ballAfter: Cell | null;
  escapedThrough: Direction | null;
  shortestAfterPlacement: ShortestEscapeInfo;
  distancesAfterPlacement: DirectionalDistances;
}

export interface GameState {
  size: number;
  posts: Post[];
  ball: Cell;
  turn: Player;
  moveNumber: number;
  outcome: GameOutcome;
  lastMove: MoveRecord | null;
}

export interface MovePreview {
  move: LegalMove;
  before: DirectionalDistances;
  afterPlacement: DirectionalDistances;
  shortestAfterPlacement: ShortestEscapeInfo;
  ballWillMove: Direction | null;
  wouldTrap: boolean;
}
