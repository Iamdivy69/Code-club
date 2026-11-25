import type { ProblemSpec } from './problem-spec.js';

type Design = NonNullable<ProblemSpec['designContract']>;

export const minStackDesign = {
  className: 'MinStack', resultMode: 'returningOnly', includeConstructor: false,
  signatures: {
    constructorArgs: [], methods: {
      push: { args: ['int'], returns: 'void' }, pop: { args: [], returns: 'void' },
      top: { args: [], returns: 'int' }, getMin: { args: [], returns: 'int' },
    },
  },
} satisfies Design;

export const minStackStarters = {
  javascript: 'class MinStack {\n  push(value) {}\n  pop() {}\n  top() { return 0; }\n  getMin() { return 0; }\n}\n',
  typescript: 'class MinStack {\n  push(value: number): void {}\n  pop(): void {}\n  top(): number { return 0; }\n  getMin(): number { return 0; }\n}\n',
  python: 'class MinStack:\n    def push(self, value):\n        pass\n\n    def pop(self):\n        pass\n\n    def top(self):\n        return 0\n\n    def getMin(self):\n        return 0\n',
  java: 'class MinStack {\n    public void push(int value) {}\n    public void pop() {}\n    public int top() { return 0; }\n    public int getMin() { return 0; }\n}\n',
  cpp: 'class MinStack {\npublic:\n    void push(int value) {}\n    void pop() {}\n    int top() { return 0; }\n    int getMin() { return 0; }\n};\n',
  c: 'typedef struct MinStack {\n    int size;\n} MinStack;\n\nMinStack* MinStack_create(void) { return calloc(1, sizeof(MinStack)); }\nvoid MinStack_push(MinStack* stack, int value) {}\nvoid MinStack_pop(MinStack* stack) {}\nint MinStack_top(MinStack* stack) { return 0; }\nint MinStack_getMin(MinStack* stack) { return 0; }\n',
} satisfies ProblemSpec['starters'];

export function weightedIndexDesign(className: string, method: string): Design {
  return {
    className, resultMode: 'all', includeConstructor: false,
    signatures: { constructorArgs: ['int[]'], methods: { [method]: { args: [], returns: 'int' } } },
    weightedSampling: { method, weightArgument: 0 },
  };
}

type Compatibility = { design: Design; starters?: ProblemSpec['starters'] };

export function referenceDesign(slug: string, sourceDigest: string): Compatibility | undefined {
  if (slug === 'min-stack' && sourceDigest === 'ea6c3905edc502084154490a0566331d83c078b519482abe9c16449aff143fca') {
    return { design: minStackDesign, starters: minStackStarters };
  }
  if (slug === 'random-pick-with-weight' && sourceDigest === '2961c3aa10dd6817e6009ae80dcceed34171d6ff3b19057953b877ed80cf0635') {
    return { design: weightedIndexDesign('Solution', 'pickIndex') };
  }
  return undefined;
}
