import type { PrismaClient } from '@prisma/client';
import { weightedExpectation } from '../src/modules/practice/contracts.js';
import { problemSpec, testCases, validateDrivers } from '../src/modules/practice/problem-spec.js';
import { minStackDesign, minStackStarters, weightedIndexDesign } from '../src/modules/practice/reference-designs.js';

const pickerStarters = {
  javascript: 'class WeightedPicker {\n  constructor(weights) {}\n  draw() { return 0; }\n}\n',
  typescript: 'class WeightedPicker {\n  constructor(weights: number[]) {}\n  draw(): number { return 0; }\n}\n',
  python: 'class WeightedPicker:\n    def __init__(self, weights):\n        pass\n    def draw(self):\n        return 0\n',
  java: 'class WeightedPicker {\n    public WeightedPicker(int[] weights) {}\n    public int draw() { return 0; }\n}\n',
  cpp: 'class WeightedPicker {\npublic:\n    explicit WeightedPicker(const vector<int>& weights) {}\n    int draw() { return 0; }\n};\n',
  c: 'typedef struct WeightedPicker {\n    int size;\n} WeightedPicker;\n\nWeightedPicker* WeightedPicker_create(const int* weights, int size) {\n    return calloc(1, sizeof(WeightedPicker));\n}\n\nint WeightedPicker_draw(WeightedPicker* picker) { return 0; }\n',
};

const exercises = [
  {
    slug: 'minimum-stack-checkpoints', title: 'Minimum Stack Checkpoints', topic: 'Stacks', difficulty: 'MEDIUM',
    description: 'Implement a stack with push, pop, top, and getMin. At each checkpoint, return the top value or the lowest value still on the stack in constant time.',
    functionName: 'MinStack', parameterOrder: [], designContract: minStackDesign, starters: minStackStarters,
    constraints: ['Each test uses at most 999 stack operations.', 'Every read and pop has a nonempty stack.'],
    hints: ['Store the minimum so far alongside each stack entry.'],
    visible: [
      { input: { operations: ['MinStack', 'push', 'push', 'top', 'getMin', 'pop', 'getMin'], arguments: [[], [8], [11], [], [], [], []] }, expected: [11, 8, 8] },
      { input: { operations: ['MinStack', 'push', 'push', 'pop', 'top', 'getMin'], arguments: [[], [-5], [-5], [], [], []] }, expected: [-5, -5] },
    ],
    hidden: [
      { input: { operations: ['MinStack', 'push', 'push', 'push', 'getMin', 'pop', 'getMin', 'pop', 'getMin'], arguments: [[], [6], [4], [-3], [], [], [], [], []] }, expected: [-3, 4, 6] },
      { input: { operations: ['MinStack', 'push', 'pop', 'push', 'push', 'getMin', 'top'], arguments: [[], [-2], [], [14], [9], [], []] }, expected: [9, 9] },
    ],
  },
  {
    slug: 'weighted-ticket-draw', title: 'Weighted Ticket Draw', topic: 'Randomized algorithms', difficulty: 'MEDIUM',
    description: 'Implement a picker over a list of positive ticket weights. Each draw returns a zero-based index with probability equal to its weight divided by the total weight.',
    functionName: 'WeightedPicker', parameterOrder: [], designContract: weightedIndexDesign('WeightedPicker', 'draw'), starters: pickerStarters,
    constraints: ['1 to 10,000 weights.', 'Each weight is between 1 and 100,000.', 'Successive draws are independent.'],
    hints: ['Use cumulative weights to partition a range of equally likely ticket numbers.'],
    visible: [
      { input: { operations: ['WeightedPicker', 'draw'], arguments: [[[7]], []] }, expected: [0] },
      { input: { operations: ['WeightedPicker', 'draw'], arguments: [[[4, 1]], []] }, expected: weightedExpectation },
    ],
    hidden: [
      { input: { operations: ['WeightedPicker', 'draw'], arguments: [[[2, 3, 11]], []] }, expected: weightedExpectation },
      { input: { operations: ['WeightedPicker', 'draw'], arguments: [[[12, 1, 4]], []] }, expected: weightedExpectation },
    ],
  },
];

export async function seedDesignLibrary(db: PrismaClient) {
  for (const fixture of exercises) {
    const spec = problemSpec.parse(fixture);
    validateDrivers(spec);
    const { slug, title, topic, difficulty, description, hints, constraints, starters, functionName, parameterOrder, designContract } = spec;
    await db.problem.upsert({
      where: { slug }, update: {}, create: {
        slug, title, topic, difficulty, description, hints, constraints: constraints.join('\n'), isPublished: true,
        starterCode: starters,
        practiceContract: { create: { functionName, parameterOrder, designContract, enabled: true, cases: { create: testCases(spec) } } },
      },
    });
  }
}
