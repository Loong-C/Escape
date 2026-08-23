import { FEATURE_NAMES, assertFeatureShape } from "./features";
import { SeededRandom } from "./random";

export interface TrainingMetadata {
  algorithm: string;
  episodes: number;
  seed: number;
  trainedAt: string;
  elapsedSeconds: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  trappedWins?: number;
  escapedWins?: number;
  curriculum?: string;
  boardCounts?: string;
  continuedFromEpisodes?: number;
  additionalEpisodes?: number;
  fullPolicyRate?: number;
  representation?: string;
  expandedFromFeatures?: number;
  selectionBenchmark?: Record<string, number | string>;
  benchmark?: Record<string, number | string>;
}

export interface SerializedValueNetwork {
  format: "escape-value-network-v1";
  featureNames: string[];
  hiddenSize: number;
  inputWeights: number[];
  hiddenBias: number[];
  outputWeights: number[];
  outputBias: number;
  metadata: TrainingMetadata;
}

interface AdamMoments {
  first: Float64Array;
  second: Float64Array;
}

function createMoments(length: number): AdamMoments {
  return {
    first: new Float64Array(length),
    second: new Float64Array(length),
  };
}

export class ValueNetwork {
  readonly inputSize = FEATURE_NAMES.length;
  readonly hiddenSize: number;
  readonly inputWeights: Float64Array;
  readonly hiddenBias: Float64Array;
  readonly outputWeights: Float64Array;
  outputBias: number;

  private readonly inputMoments: AdamMoments;
  private readonly hiddenBiasMoments: AdamMoments;
  private readonly outputMoments: AdamMoments;
  private outputBiasFirst = 0;
  private outputBiasSecond = 0;
  private updateCount = 0;

  constructor(hiddenSize = 32, random = new SeededRandom(1)) {
    this.hiddenSize = hiddenSize;
    this.inputWeights = new Float64Array(hiddenSize * this.inputSize);
    this.hiddenBias = new Float64Array(hiddenSize);
    this.outputWeights = new Float64Array(hiddenSize);
    this.outputBias = 0;

    const inputScale = Math.sqrt(2 / (this.inputSize + hiddenSize));
    const outputScale = Math.sqrt(2 / (hiddenSize + 1));
    for (let index = 0; index < this.inputWeights.length; index += 1) {
      this.inputWeights[index] = random.gaussian() * inputScale;
    }
    for (let index = 0; index < hiddenSize; index += 1) {
      this.outputWeights[index] = random.gaussian() * outputScale;
    }

    this.inputMoments = createMoments(this.inputWeights.length);
    this.hiddenBiasMoments = createMoments(this.hiddenBias.length);
    this.outputMoments = createMoments(this.outputWeights.length);
  }

  static fromJSON(serialized: SerializedValueNetwork): ValueNetwork {
    if (
      serialized.format !== "escape-value-network-v1" ||
      serialized.featureNames.join("|") !== FEATURE_NAMES.join("|")
    ) {
      throw new Error("AI 模型格式或特征版本不匹配");
    }

    const network = new ValueNetwork(serialized.hiddenSize);
    network.inputWeights.set(serialized.inputWeights);
    network.hiddenBias.set(serialized.hiddenBias);
    network.outputWeights.set(serialized.outputWeights);
    network.outputBias = serialized.outputBias;
    return network;
  }

  evaluate(features: readonly number[]): number {
    assertFeatureShape(features);
    const hidden = this.hiddenActivations(features);
    let sum = this.outputBias;
    for (let index = 0; index < this.hiddenSize; index += 1) {
      sum += hidden[index] * this.outputWeights[index];
    }
    return Math.tanh(sum);
  }

  trainSample(
    features: readonly number[],
    target: number,
    learningRate: number,
    l2 = 0.000_01,
  ): number {
    assertFeatureShape(features);
    const hidden = this.hiddenActivations(features);
    let outputPreActivation = this.outputBias;
    for (let index = 0; index < this.hiddenSize; index += 1) {
      outputPreActivation += hidden[index] * this.outputWeights[index];
    }
    const output = Math.tanh(outputPreActivation);
    const error = output - Math.max(-1, Math.min(1, target));
    const outputGradient = error * (1 - output * output);
    const hiddenGradients = new Float64Array(this.hiddenSize);

    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      hiddenGradients[hiddenIndex] =
        outputGradient *
        this.outputWeights[hiddenIndex] *
        (1 - hidden[hiddenIndex] * hidden[hiddenIndex]);
    }

    this.updateCount += 1;
    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      this.adamUpdate(
        this.outputWeights,
        hiddenIndex,
        outputGradient * hidden[hiddenIndex] + l2 * this.outputWeights[hiddenIndex],
        this.outputMoments,
        learningRate,
      );

      this.adamUpdate(
        this.hiddenBias,
        hiddenIndex,
        hiddenGradients[hiddenIndex],
        this.hiddenBiasMoments,
        learningRate,
      );

      const offset = hiddenIndex * this.inputSize;
      for (let inputIndex = 0; inputIndex < this.inputSize; inputIndex += 1) {
        const weightIndex = offset + inputIndex;
        this.adamUpdate(
          this.inputWeights,
          weightIndex,
          hiddenGradients[hiddenIndex] * features[inputIndex] +
            l2 * this.inputWeights[weightIndex],
          this.inputMoments,
          learningRate,
        );
      }
    }

    const beta1 = 0.9;
    const beta2 = 0.999;
    this.outputBiasFirst = beta1 * this.outputBiasFirst + (1 - beta1) * outputGradient;
    this.outputBiasSecond =
      beta2 * this.outputBiasSecond + (1 - beta2) * outputGradient * outputGradient;
    const firstCorrected = this.outputBiasFirst / (1 - beta1 ** this.updateCount);
    const secondCorrected = this.outputBiasSecond / (1 - beta2 ** this.updateCount);
    this.outputBias -=
      (learningRate * firstCorrected) / (Math.sqrt(secondCorrected) + 1e-8);

    return error * error;
  }

  serialize(metadata: TrainingMetadata): SerializedValueNetwork {
    return {
      format: "escape-value-network-v1",
      featureNames: [...FEATURE_NAMES],
      hiddenSize: this.hiddenSize,
      inputWeights: Array.from(this.inputWeights),
      hiddenBias: Array.from(this.hiddenBias),
      outputWeights: Array.from(this.outputWeights),
      outputBias: this.outputBias,
      metadata,
    };
  }

  private hiddenActivations(features: readonly number[]): Float64Array {
    const hidden = new Float64Array(this.hiddenSize);
    for (let hiddenIndex = 0; hiddenIndex < this.hiddenSize; hiddenIndex += 1) {
      let sum = this.hiddenBias[hiddenIndex];
      const offset = hiddenIndex * this.inputSize;
      for (let inputIndex = 0; inputIndex < this.inputSize; inputIndex += 1) {
        sum += this.inputWeights[offset + inputIndex] * features[inputIndex];
      }
      hidden[hiddenIndex] = Math.tanh(sum);
    }
    return hidden;
  }

  private adamUpdate(
    parameters: Float64Array,
    index: number,
    gradient: number,
    moments: AdamMoments,
    learningRate: number,
  ): void {
    const beta1 = 0.9;
    const beta2 = 0.999;
    moments.first[index] = beta1 * moments.first[index] + (1 - beta1) * gradient;
    moments.second[index] =
      beta2 * moments.second[index] + (1 - beta2) * gradient * gradient;
    const firstCorrected = moments.first[index] / (1 - beta1 ** this.updateCount);
    const secondCorrected = moments.second[index] / (1 - beta2 ** this.updateCount);
    parameters[index] -=
      (learningRate * firstCorrected) / (Math.sqrt(secondCorrected) + 1e-8);
  }
}
