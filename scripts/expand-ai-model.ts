import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FEATURE_NAMES, type SerializedValueNetwork } from "../src/ai/index.ts";

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const input = stringArgument(
  "input",
  resolve(process.cwd(), "src/ai/model/escape-value.json"),
);
const output = stringArgument("output", input);
const serialized = JSON.parse(
  await readFile(input, "utf8"),
) as SerializedValueNetwork;
const previousInputSize = serialized.featureNames.length;

if (previousInputSize >= FEATURE_NAMES.length) {
  throw new Error("模型已经使用当前或更大的特征表示");
}
if (
  serialized.featureNames.some((name, index) => name !== FEATURE_NAMES[index]) ||
  serialized.inputWeights.length !== serialized.hiddenSize * previousInputSize
) {
  throw new Error("旧模型特征不是新表示的兼容前缀");
}

const expandedWeights = Array<number>(
  serialized.hiddenSize * FEATURE_NAMES.length,
).fill(0);
for (let hidden = 0; hidden < serialized.hiddenSize; hidden += 1) {
  for (let inputIndex = 0; inputIndex < previousInputSize; inputIndex += 1) {
    expandedWeights[hidden * FEATURE_NAMES.length + inputIndex] =
      serialized.inputWeights[hidden * previousInputSize + inputIndex];
  }
}

const expanded: SerializedValueNetwork = {
  ...serialized,
  featureNames: [...FEATURE_NAMES],
  inputWeights: expandedWeights,
  metadata: {
    ...serialized.metadata,
    representation: `${FEATURE_NAMES.length} features including a perspective-canonical 7x7 raw local post window and board-validity mask`,
    expandedFromFeatures: previousInputSize,
    trainedAt: new Date().toISOString(),
  },
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(expanded, null, 2)}\n`);
process.stdout.write(
  `expanded=${previousInputSize}->${FEATURE_NAMES.length} model=${output}\n`,
);
