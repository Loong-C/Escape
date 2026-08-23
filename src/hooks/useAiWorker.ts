import { useCallback, useEffect, useRef } from "react";
import type { GameState, LegalMove } from "../game";
import type { AiDifficulty, SearchResult } from "../ai";
import type { AiMoveRequest, AiWorkerResponse } from "../ai/messages";

interface PendingRequest {
  resolve: (value: AiTurnResult) => void;
  reject: (reason: Error) => void;
}

export interface AiTurnResult {
  move: LegalMove;
  stats: Omit<SearchResult, "move">;
}

export function useAiWorker() {
  const workerRef = useRef<Worker | null>(null);
  const nextRequestId = useRef(1);
  const pending = useRef(new Map<number, PendingRequest>());

  useEffect(() => {
    const worker = new Worker(new URL("../ai/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
      const response = event.data;
      const request = pending.current.get(response.requestId);
      if (!request) return;
      pending.current.delete(response.requestId);
      if (response.type === "move-error") {
        request.reject(new Error(response.message));
      } else {
        request.resolve({ move: response.move, stats: response.stats });
      }
    };
    worker.onerror = () => {
      for (const request of pending.current.values()) {
        request.reject(new Error("AI Worker 发生错误"));
      }
      pending.current.clear();
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      for (const request of pending.current.values()) {
        request.reject(new Error("AI Worker 已关闭"));
      }
      pending.current.clear();
    };
  }, []);

  return useCallback((state: GameState, difficulty: AiDifficulty) => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("AI Worker 尚未就绪"));
    }
    const requestId = nextRequestId.current++;
    const message: AiMoveRequest = {
      type: "choose-move",
      requestId,
      state,
      difficulty,
    };
    return new Promise<AiTurnResult>((resolve, reject) => {
      pending.current.set(requestId, { resolve, reject });
      worker.postMessage(message);
    });
  }, []);
}
