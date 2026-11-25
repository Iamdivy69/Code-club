import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildDriver, type Suite } from '../src/modules/practice/drivers.js';
import { fixtureEdgeCases, specialDrivers } from './special-driver-fixtures.js';
import { checkWeightedOutput, weightedSampleCount } from '../src/modules/practice/weighted-sampling.js';

function run(suite: Suite, input: Record<string, unknown>, code: string) {
  let stdout: string | undefined;
  runInNewContext(buildDriver('javascript', suite, JSON.stringify(input), code), {
    console: { log: (value: string) => { stdout = value; } },
  }, { timeout: 1_000 });
  return JSON.parse(stdout!);
}

const references: Suite = {
  functionName: 'byIdentity', parameterOrder: ['target', 'root'], comparisonMode: 'EXACT',
  nativeSignature: {
    args: ['int', 'TreeNode'], returns: 'TreeNode',
    treeReferences: [{ argument: 0, root: 1 }], treeResult: 'value',
  },
};

describe('weighted indices', () => {
  it('takes a weighted distribution and rejects a uniform, malformed, or out-of-range sample', () => {
    const plan = { method: 'draw', weights: [3, 1] };
    const output = (indices: number[]) => checkWeightedOutput(JSON.stringify(indices), plan).passed;
    const indices = (zeroCount: number) => Array.from({ length: weightedSampleCount }, (_, i) => i < zeroCount ? 0 : 1);
    expect(output(indices(weightedSampleCount * 3 / 4))).toBe(true);
    expect(output(indices(weightedSampleCount / 2))).toBe(false);
    expect(output(indices(weightedSampleCount))).toBe(false);
    expect(output([0, 1, 1])).toBe(false);
    expect(output([...indices(weightedSampleCount * 3 / 4).slice(0, -1), 2])).toBe(false);
    expect(checkWeightedOutput('not JSON', plan).passed).toBe(false);
  });
});

describe('advanced execution contracts', () => {
  it('passes the selected node from the same tree and projects the returned value', () => {
    const code = 'function byIdentity(target, root) { return target === root.right ? root : null; }';
    expect(run(references, { root: [17, null, 2], target: 2 }, code)).toBe(17);
    expect(run(references, { root: [17, null, 2], target: 17 }, code)).toBeNull();
  });

  it('rejects unavailable or ambiguous node selectors before execution', () => {
    const code = 'function byIdentity() {}';
    for (const input of [{ root: [17], target: 2 }, { root: [1, 2, 2], target: 2 }]) {
      expect(() => buildDriver('javascript', references, JSON.stringify(input), code)).toThrow(expect.objectContaining({ code: 'SUITE_INVALID' }));
    }
  });

  it('compares the restored tree while allowing the codec to choose its own text format', () => {
    const suite: Suite = {
      functionName: 'save', parameterOrder: ['root'], comparisonMode: 'EXACT',
      nativeSignature: { args: ['TreeNode'], returns: 'TreeNode', treeCodec: { deserialize: 'load', className: 'Codec' } },
    };
    const code = 'function save(node) { return "v1|" + JSON.stringify(node); }\nfunction load(text) { return JSON.parse(text.slice(3)); }';
    expect(run(suite, { root: [4, null, 7, -3] }, code)).toEqual([4, null, 7, -3]);
    expect(run(suite, { root: [] }, code)).toEqual([]);
  });
});


describe('special grader inputs', () => {
  it.each([...specialDrivers, ...fixtureEdgeCases])('generates the $name fixture', ({ suite, input, code, output }) => {
    expect(run(suite, input, code.javascript)).toEqual(output);
  });

  it('rejects out-of-range selectors and inconsistent graph or shared-tail inputs', () => {
    const bad = [
      { index: 0, input: { count: 2, first: 9 } },
      { index: 1, input: { head: [9], position: 1 } },
      { index: 2, input: { left: [4, 8], right: [5, 8], intersect: 4, skipLeft: 0, skipRight: 1 } },
      { index: 4, input: { word: 4294967296 } },
      { index: 5, input: { edges: [[3], [1]] } },
    ];
    for (const { index, input } of bad) {
      const { suite, code } = specialDrivers[index]!;
      expect(() => buildDriver('javascript', suite, JSON.stringify(input), code.javascript))
        .toThrow(expect.objectContaining({ code: 'SUITE_INVALID' }));
    }
  });
});
