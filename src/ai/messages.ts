import type { GameState, LegalMove } from "../game";
import type { AiDifficulty, SearchResult } from "./search";

export interface AiMoveRequest {
  type: "choose-move";
  requestId: number;
  state: GameState;
  difficulty: AiDifficulty;
}

export interface AiMoveResponse {
  type: "move-result";
  requestId: number;
  move: LegalMove;
  stats: Omit<SearchResult, "move">;
}

export interface AiErrorResponse {
  type: "move-error";
  requestId: number;
  message: string;
}

export type AiWorkerResponse = AiMoveResponse | AiErrorResponse;
