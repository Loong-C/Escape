import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGame } from "../src/game/index.ts";
import {
  ValueNetwork,
  chooseMoveWithSearch,
  type SerializedValueNetwork,
} from "../src/ai/index.ts";

function numberArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const modelPath = stringArgument(
  "model",
  resolve(process.cwd(), "src/ai/model/escape-value.json"),
);
const timeBudgetMs = numberArgument("time", 12_000);
const maxDepth = numberArgument("depth", 5);
const serialized = JSON.parse(
  await readFile(modelPath, "utf8"),
) as SerializedValueNetwork;
const result = chooseMoveWithSearch(
  createGame(),
  ValueNetwork.fromJSON(serialized),
  {
    difficulty: "hard",
    timeBudgetMs,
    maxDepth,
    seed: numberArgument("seed", 20_260_824),
  },
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
