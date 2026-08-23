/// <reference lib="webworker" />

import type { AiMoveRequest, AiWorkerResponse } from "./messages";
import { chooseMoveWithSearch } from "./search";
import { ValueNetwork, type SerializedValueNetwork } from "./value-network";

let modelPromise: Promise<ValueNetwork> | null = null;

function loadModel(): Promise<ValueNetwork> {
  modelPromise ??= fetch(`${import.meta.env.BASE_URL}ai/escape-value.json`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`AI 模型加载失败 (${response.status})`);
      }
      return response.json() as Promise<SerializedValueNetwork>;
    })
    .then((serialized) => ValueNetwork.fromJSON(serialized));
  return modelPromise;
}

self.onmessage = async (event: MessageEvent<AiMoveRequest>) => {
  const request = event.data;
  if (request.type !== "choose-move") {
    return;
  }

  try {
    const model = await loadModel();
    const result = chooseMoveWithSearch(request.state, model, {
      difficulty: request.difficulty,
      timeBudgetMs: request.difficulty === "hard" ? 5_200 : 260,
      maxDepth: request.difficulty === "hard" ? 4 : 1,
      seed: request.state.moveNumber * 65_537 + request.requestId,
    });
    const response: AiWorkerResponse = {
      type: "move-result",
      requestId: request.requestId,
      move: result.move,
      stats: {
        score: result.score,
        depth: result.depth,
        nodes: result.nodes,
        elapsedMs: result.elapsedMs,
        candidates: result.candidates,
      },
    };
    self.postMessage(response);
  } catch (error) {
    const response: AiWorkerResponse = {
      type: "move-error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "AI 计算失败",
    };
    self.postMessage(response);
  }
};

export {};
