import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createGame,
  otherPlayer,
  type GameState,
  type Player,
} from "../src/game/index.ts";
import {
  SeededRandom,
  ValueNetwork,
  chooseExploratoryMove,
  extractFeatures,
  type TrainingMetadata,
} from "../src/ai/index.ts";

interface TrainingOptions {
  episodes: number;
  seed: number;
  hiddenSize: number;
  candidateLimit: number;
  replaySize: number;
  updatesPerEpisode: number;
  fixedSize: number;
  checkpointEvery: number;
  checkpointDir: string;
  resume: string;
  output: string;
}

interface EpisodePosition {
  features: number[];
  perspective: Player;
  moveNumber: number;
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
  episodes: numberArgument("episodes", 20_000),
  seed: numberArgument("seed", 20_260_823),
  hiddenSize: numberArgument("hidden", 64),
  candidateLimit: numberArgument("candidates", 36),
  replaySize: numberArgument("replay", 120_000),
  updatesPerEpisode: numberArgument("updates", 56),
  fixedSize: numberArgument("size", 0),
  checkpointEvery: numberArgument("checkpoint", 1_000),
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
let trappedWins = resumedModel?.metadata.trappedWins ?? 0;
let escapedWins = resumedModel?.metadata.escapedWins ?? 0;
let rollingLoss = 0;
let rollingMoves = 0;
const boardCounts = new Map<number, number>();

function finalReward(state: GameState, perspective: Player): number {
  if (state.outcome.status === "draw") {
    return 0;
  }
  if (state.outcome.status === "won") {
    return state.outcome.winner === perspective ? 1 : -1;
  }
  return 0;
}

function curriculumBoardSize(progress: number): number {
  if (options.fixedSize > 0) return options.fixedSize;
  const sizes =
    progress < 0.2
      ? [3, 3, 5]
      : progress < 0.45
        ? [3, 5, 5, 7]
        : progress < 0.7
          ? [5, 7, 7, 9, 11]
          : [5, 7, 9, 11, 11, 11, 11];
  return sizes[random.integer(sizes.length)];
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
    algorithm:
      "terminal-reward-only dual-perspective self-play Monte Carlo value learning with Adam and neural policy improvement",
    episodes,
    seed: options.seed,
    trainedAt: new Date().toISOString(),
    elapsedSeconds:
      previousElapsedSeconds + (performance.now() - startedAt) / 1_000,
    whiteWins,
    blackWins,
    draws,
    trappedWins,
    escapedWins,
    curriculum:
      options.fixedSize > 0
        ? `fixed ${options.fixedSize}x${options.fixedSize} board`
        : "odd board sizes 3,5,7,9,11; final phase weighted toward 11",
    boardCounts: [...boardCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([size, count]) => `${size}:${count}`)
      .join(","),
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
  const completedEpisodes = previousEpisodes + episode;
  const progress = completedEpisodes / targetEpisodes;
  const boardSize = curriculumBoardSize(progress);
  let state = createGame(boardSize);
  const trajectory: EpisodePosition[] = [];
  boardCounts.set(boardSize, (boardCounts.get(boardSize) ?? 0) + 1);
  const epsilon = 0.3 * (1 - progress) + 0.035;
  const temperature = 0.34 * (1 - progress) + 0.06;
  const moveLimit = (state.size + 1) * (state.size + 1) + 40;

  while (state.outcome.status === "playing" && state.moveNumber < moveLimit) {
    const perspective = state.turn;
    trajectory.push({
      features: extractFeatures(state, perspective),
      perspective,
      moveNumber: state.moveNumber,
    });
    const waitingPlayer = otherPlayer(perspective);
    trajectory.push({
      features: extractFeatures(state, waitingPlayer),
      perspective: waitingPlayer,
      moveNumber: state.moveNumber,
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
  if (state.outcome.status === "won" && state.outcome.reason === "trapped") {
    trappedWins += 1;
  } else if (state.outcome.status === "won" && state.outcome.reason === "escaped") {
    escapedWins += 1;
  }
  rollingMoves += state.moveNumber;

  for (let index = 0; index < trajectory.length; index += 1) {
    const position = trajectory[index];
    const stepsRemaining = state.moveNumber - position.moveNumber;
    const terminal = finalReward(state, position.perspective);
    const target = terminal * 0.997 ** stepsRemaining;
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
