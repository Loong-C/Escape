import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createGame, type GameState, type Player } from "../src/game/index.ts";
import {
  SeededRandom,
  ValueNetwork,
  chooseExploratoryMove,
  extractFeatures,
  heuristicValue,
  type TrainingMetadata,
} from "../src/ai/index.ts";

interface TrainingOptions {
  episodes: number;
  seed: number;
  hiddenSize: number;
  candidateLimit: number;
  replaySize: number;
  updatesPerEpisode: number;
  checkpointEvery: number;
  checkpointDir: string;
  resume: string;
  output: string;
}

interface EpisodePosition {
  features: number[];
  perspective: Player;
  heuristic: number;
}

interface ReplaySample {
  features: number[];
  target: number;
}

function numberArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const options: TrainingOptions = {
  episodes: numberArgument("episodes", 8_000),
  seed: numberArgument("seed", 20_260_823),
  hiddenSize: numberArgument("hidden", 32),
  candidateLimit: numberArgument("candidates", 28),
  replaySize: numberArgument("replay", 60_000),
  updatesPerEpisode: numberArgument("updates", 40),
  checkpointEvery: numberArgument("checkpoint", 500),
  checkpointDir: stringArgument("checkpoint-dir", ""),
  resume: stringArgument("resume", ""),
  output: stringArgument(
    "output",
    resolve(process.cwd(), "src/ai/model/escape-value.json"),
  ),
};

const random = new SeededRandom(options.seed);
const resumedModel = options.resume
  ? (JSON.parse(await readFile(options.resume, "utf8")) as ReturnType<ValueNetwork["serialize"]>)
  : null;
const network = resumedModel
  ? ValueNetwork.fromJSON(resumedModel)
  : new ValueNetwork(options.hiddenSize, random);
const previousEpisodes = resumedModel?.metadata.episodes ?? 0;
const previousElapsedSeconds = resumedModel?.metadata.elapsedSeconds ?? 0;
const targetEpisodes = previousEpisodes + options.episodes;
const replay: ReplaySample[] = [];
const startedAt = performance.now();
let whiteWins = resumedModel?.metadata.whiteWins ?? 0;
let blackWins = resumedModel?.metadata.blackWins ?? 0;
let draws = resumedModel?.metadata.draws ?? 0;
let rollingLoss = 0;
let rollingMoves = 0;

function finalReward(state: GameState, perspective: Player): number {
  if (state.outcome.status === "draw") {
    return 0;
  }
  if (state.outcome.status === "won") {
    return state.outcome.winner === perspective ? 1 : -1;
  }
  return heuristicValue(state, perspective) * 0.4;
}

function pushReplay(sample: ReplaySample): void {
  if (replay.length >= options.replaySize) {
    replay[random.integer(replay.length)] = sample;
  } else {
    replay.push(sample);
  }
}

async function writeModel(episodes: number): Promise<void> {
  const metadata: TrainingMetadata = {
    algorithm: "self-play Monte Carlo value learning with Adam and policy improvement",
    episodes,
    seed: options.seed,
    trainedAt: new Date().toISOString(),
    elapsedSeconds:
      previousElapsedSeconds + (performance.now() - startedAt) / 1_000,
    whiteWins,
    blackWins,
    draws,
    continuedFromEpisodes: previousEpisodes,
    additionalEpisodes: episodes - previousEpisodes,
  };
  const payload = `${JSON.stringify(network.serialize(metadata), null, 2)}\n`;
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, payload);
  if (options.checkpointDir) {
    await mkdir(options.checkpointDir, { recursive: true });
    await writeFile(
      resolve(options.checkpointDir, `escape-value-${episodes}.json`),
      payload,
    );
  }
}

for (let episode = 1; episode <= options.episodes; episode += 1) {
  let state = createGame();
  const trajectory: EpisodePosition[] = [];
  const completedEpisodes = previousEpisodes + episode;
  const progress = completedEpisodes / targetEpisodes;
  const epsilon = 0.3 * (1 - progress) + 0.035;
  const temperature = 0.34 * (1 - progress) + 0.06;
  const moveLimit = (state.size + 1) * (state.size + 1) + 40;

  while (state.outcome.status === "playing" && state.moveNumber < moveLimit) {
    const perspective = state.turn;
    trajectory.push({
      features: extractFeatures(state, perspective),
      perspective,
      heuristic: heuristicValue(state, perspective),
    });
    const choice = chooseExploratoryMove(state, network, random, {
      candidateLimit: options.candidateLimit,
      epsilon,
      temperature,
    });
    state = choice.state;
  }

  if (state.outcome.status === "won" && state.outcome.winner === "white") {
    whiteWins += 1;
  } else if (state.outcome.status === "won" && state.outcome.winner === "black") {
    blackWins += 1;
  } else {
    draws += 1;
  }
  rollingMoves += state.moveNumber;

  for (let index = 0; index < trajectory.length; index += 1) {
    const position = trajectory[index];
    const stepsRemaining = trajectory.length - index - 1;
    const terminal = finalReward(state, position.perspective);
    const discounted = terminal * 0.998 ** stepsRemaining;
    const target = discounted * 0.92 + position.heuristic * 0.08;
    pushReplay({ features: position.features, target });
  }

  const learningRate = 0.0018 * (1 - progress * 0.72) + 0.0002;
  const updateCount = Math.min(options.updatesPerEpisode, replay.length);
  for (let update = 0; update < updateCount; update += 1) {
    const sample = replay[random.integer(replay.length)];
    rollingLoss += network.trainSample(sample.features, sample.target, learningRate);
  }

  if (episode % 100 === 0) {
    const elapsed = (performance.now() - startedAt) / 1_000;
    const gamesPerSecond = episode / elapsed;
    const meanLoss = rollingLoss / (100 * options.updatesPerEpisode);
    const meanMoves = rollingMoves / 100;
    process.stdout.write(
      `episode=${completedEpisodes}/${targetEpisodes} ` +
        `loss=${meanLoss.toFixed(4)} moves=${meanMoves.toFixed(1)} ` +
        `W=${whiteWins} B=${blackWins} D=${draws} ` +
        `speed=${gamesPerSecond.toFixed(2)}eps/s\n`,
    );
    rollingLoss = 0;
    rollingMoves = 0;
  }

  if (episode % options.checkpointEvery === 0) {
    await writeModel(completedEpisodes);
  }
}

await writeModel(targetEpisodes);
process.stdout.write(`model=${options.output}\n`);
