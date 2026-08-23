export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  gaussian(): number {
    const first = Math.max(this.next(), Number.EPSILON);
    const second = this.next();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  }

  shuffle<T>(values: T[]): T[] {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const other = this.integer(index + 1);
      [values[index], values[other]] = [values[other], values[index]];
    }
    return values;
  }
}
