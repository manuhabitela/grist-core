/**
 * Implements a binary indexed tree, aka Fenwick tree. See
 * http://en.wikipedia.org/wiki/Fenwick_tree
 */
declare class BinaryIndexedTree {
  constructor(optSize?: number);

  size(): number;
  toCumulativeArray(): number[];
  toValueArray(): number[];
  fillFromCumulative(cumulValues: number[]): void;
  fillFromValues(values: number[]): void;
  getCumulativeValue(index: number): number;
  getCumulativeValueRange(start: number, end: number): number;
  getSumTo(index: number): number;
  getTotal(): number;
  getValue(index: number): number;
  addValue(index: number, delta: number): void;
  setValue(index: number, value: number): void;
  getIndex(cumulValue: number): number;

  static leastSignificantOne(num: number): number;
  static stripLeastSignificantOne(num: number): number;
  static mostSignificantOne(num: number): number;
  static cumulToValues(values: number[]): number[];
  static valuesToCumul(values: number[]): number[];
}

export = BinaryIndexedTree;
