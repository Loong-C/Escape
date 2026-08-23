import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SerializedValueNetwork, TrainingMetadata } from "../src/ai/index.ts";

function stringArgument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`缺少 --${name} 参数`);
  }
  return process.argv[index + 1];
}

function numberArgument(name: string): number {
  const value = Number(stringArgument(name));
  if (!Number.isFinite(value)) throw new Error(`--${name} 必须是数字`);
  return value;
}

const basePath = stringArgument("base");
const candidatePath = stringArgument("candidate");
const outputPath = resolve(stringArgument("output"));
const alpha = numberArgument("alpha");
if (alpha <= 0 || alpha >= 1) {
  throw new Error("--alpha 必须大于 0 且小于 1");
}

const base = JSON.parse(await readFile(basePath, "utf8")) as SerializedValueNetwork;
const candidate = JSON.parse(
  await readFile(candidatePath, "utf8"),
) as SerializedValueNetwork;
if (
  base.format !== candidate.format ||
  base.hiddenSize !== candidate.hiddenSize ||
  base.featureNames.join("|") !== candidate.featureNames.join("|")
) {
  throw new Error("两个模型的结构不一致，不能插值");
}

function blendArray(left: number[], right: number[]): number[] {
  if (left.length !== right.length) throw new Error("模型参数长度不一致");
  return left.map((value, index) => value * (1 - alpha) + right[index] * alpha);
}

const { benchmark: _ignoredBenchmark, ...candidateMetadata } = candidate.metadata;
const metadata: TrainingMetadata = {
  ...candidateMetadata,
  algorithm: `${candidate.metadata.algorithm}; linear checkpoint interpolation alpha=${alpha}`,
};
const blended: SerializedValueNetwork = {
  ...candidate,
  inputWeights: blendArray(base.inputWeights, candidate.inputWeights),
  hiddenBias: blendArray(base.hiddenBias, candidate.hiddenBias),
  outputWeights: blendArray(base.outputWeights, candidate.outputWeights),
  outputBias: base.outputBias * (1 - alpha) + candidate.outputBias * alpha,
  metadata,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(blended, null, 2)}\n`);
process.stdout.write(`model=${outputPath} alpha=${alpha}\n`);
