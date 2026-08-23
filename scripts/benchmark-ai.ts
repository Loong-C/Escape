import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { applyMove, createGame, type Player } from "../src/game/index.ts";
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
const opponentPath = stringArgument("opponent", "");
const serialized = JSON.parse(await readFile(modelPath, "utf8")) as SerializedValueNetwork;
const learned = ValueNetwork.fromJSON(serialized);
const opponent = opponentPath
  ? ValueNetwork.fromJSON(
      JSON.parse(await readFile(opponentPath, "utf8")) as SerializedValueNetwork,
    )
  : new ValueNetwork(serialized.hiddenSize);
if (!opponentPath) {
  opponent.inputWeights.fill(0);
  opponent.hiddenBias.fill(0);
  opponent.outputWeights.fill(0);
  opponent.outputBias = 0;
}

let learnedWins = 0;
let opponentWins = 0;
let draws = 0;
let totalMoves = 0;
let learnedSearches = 0;
let opponentSearches = 0;
let learnedDepthTotal = 0;
let opponentDepthTotal = 0;
let learnedNodesTotal = 0;
let opponentNodesTotal = 0;

for (let game = 0; game < games; game += 1) {
  const learnedColor: Player = game % 2 === 0 ? "white" : "black";
  let state = createGame();
  const moveLimit = (state.size + 1) * (state.size + 1) + 40;

  while (state.outcome.status === "playing" && state.moveNumber < moveLimit) {
    const model = state.turn === learnedColor ? learned : opponent;
    const result = chooseMoveWithSearch(state, model, {
      difficulty: "hard",
      timeBudgetMs,
      maxDepth,
      seed: 31_337 + game * 1_009 + state.moveNumber,
    });
    if (model === learned) {
      learnedSearches += 1;
      learnedDepthTotal += result.depth;
      learnedNodesTotal += result.nodes;
    } else {
      opponentSearches += 1;
      opponentDepthTotal += result.depth;
      opponentNodesTotal += result.nodes;
    }
    state = applyMove(state, result.move);
  }

  totalMoves += state.moveNumber;
  if (state.outcome.status !== "won") {
    draws += 1;
  } else if (state.outcome.winner === learnedColor) {
    learnedWins += 1;
  } else {
    opponentWins += 1;
  }

  process.stdout.write(
    `game=${game + 1}/${games} candidate=${learnedWins} opponent=${opponentWins} draws=${draws}\n`,
  );
}

const decisiveGames = learnedWins + opponentWins;
const learnedWinRate = decisiveGames === 0 ? 0 : learnedWins / decisiveGames;
serialized.metadata.benchmark = {
  opponent: opponentPath
    ? `serialized model ${basename(opponentPath)}`
    : "fixed zero-network heuristic search baseline",
  games,
  learnedWins,
  opponentWins,
  draws,
  learnedWinRate,
  averageMoves: totalMoves / games,
  learnedAverageDepth: learnedDepthTotal / Math.max(learnedSearches, 1),
  opponentAverageDepth: opponentDepthTotal / Math.max(opponentSearches, 1),
  learnedAverageNodes: learnedNodesTotal / Math.max(learnedSearches, 1),
  opponentAverageNodes: opponentNodesTotal / Math.max(opponentSearches, 1),
  timeBudgetMs,
  maxDepth,
};
await writeFile(modelPath, `${JSON.stringify(serialized, null, 2)}\n`);

process.stdout.write(
  `result candidate=${learnedWins} opponent=${opponentWins} draws=${draws} ` +
    `winRate=${(learnedWinRate * 100).toFixed(1)}%\n`,
);
