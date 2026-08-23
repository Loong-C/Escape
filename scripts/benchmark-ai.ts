import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGame, type Player } from "../src/game/index.ts";
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

const games = numberArgument("games", 40);
const timeBudgetMs = numberArgument("time", 90);
const maxDepth = numberArgument("depth", 2);
const modelPath = stringArgument(
  "model",
  resolve(process.cwd(), "src/ai/model/escape-value.json"),
);
const serialized = JSON.parse(await readFile(modelPath, "utf8")) as SerializedValueNetwork;
const learned = ValueNetwork.fromJSON(serialized);
const baseline = new ValueNetwork(serialized.hiddenSize);
baseline.inputWeights.fill(0);
baseline.hiddenBias.fill(0);
baseline.outputWeights.fill(0);
baseline.outputBias = 0;

let learnedWins = 0;
let baselineWins = 0;
let draws = 0;
let totalMoves = 0;

for (let game = 0; game < games; game += 1) {
  const learnedColor: Player = game % 2 === 0 ? "white" : "black";
  let state = createGame();
  const moveLimit = (state.size + 1) * (state.size + 1) + 40;

  while (state.outcome.status === "playing" && state.moveNumber < moveLimit) {
    const model = state.turn === learnedColor ? learned : baseline;
    const result = chooseMoveWithSearch(state, model, {
      difficulty: "hard",
      timeBudgetMs,
      maxDepth,
      seed: 31_337 + game * 1_009 + state.moveNumber,
    });
    const { applyMove } = await import("../src/game/index.ts");
    state = applyMove(state, result.move);
  }

  totalMoves += state.moveNumber;
  if (state.outcome.status !== "won") {
    draws += 1;
  } else if (state.outcome.winner === learnedColor) {
    learnedWins += 1;
  } else {
    baselineWins += 1;
  }

  process.stdout.write(
    `game=${game + 1}/${games} learned=${learnedWins} baseline=${baselineWins} draws=${draws}\n`,
  );
}

const decisiveGames = learnedWins + baselineWins;
const learnedWinRate = decisiveGames === 0 ? 0 : learnedWins / decisiveGames;
serialized.metadata.benchmark = {
  opponent: "fixed zero-network heuristic search baseline",
  games,
  learnedWins,
  baselineWins,
  draws,
  learnedWinRate,
  averageMoves: totalMoves / games,
  timeBudgetMs,
  maxDepth,
};
await writeFile(modelPath, `${JSON.stringify(serialized, null, 2)}\n`);

process.stdout.write(
  `result learned=${learnedWins} baseline=${baselineWins} draws=${draws} ` +
    `winRate=${(learnedWinRate * 100).toFixed(1)}%\n`,
);
