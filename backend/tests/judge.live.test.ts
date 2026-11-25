import { describe, expect, it } from 'vitest';
import type { PracticeLanguage } from '../src/modules/practice/contracts.js';
import { buildDriver, type Suite } from '../src/modules/practice/drivers.js';
import { judge0 } from '../src/modules/practice/judge.js';
import { specialDrivers } from './special-driver-fixtures.js';

const endpoint = process.env.PRACTICE_LIVE_JUDGE0_URL;
const fixtureLanguages = ['javascript', 'python', 'c', 'cpp', 'java', 'typescript'] as const;
const code: Record<PracticeLanguage, string> = {
  javascript: 'function tail(head) { return head ? head.next : null; }',
  typescript: 'function tail(head: ListNode | null): ListNode | null { return head ? head.next : null; }',
  python: 'def tail(head: ListNode):\n    return head.next if head else None',
  java: 'class Solution { ListNode tail(ListNode head) { return head == null ? null : head.next; } }',
  cpp: 'class Solution { public: ListNode* tail(ListNode* head) { return head ? head->next : nullptr; } };',
  c: 'ListNode* tail(ListNode* head) { return head ? head->next : NULL; }',
};
const suite: Suite = {
  functionName: 'tail', parameterOrder: ['head'], comparisonMode: 'EXACT',
  nativeSignature: { args: ['ListNode'], returns: 'ListNode' },
};

const advanced: Array<{ label: string; language: PracticeLanguage; suite: Suite; input: unknown; solution: string; expected: unknown }> = [
  {
    label: 'TypeScript tree references', language: 'typescript',
    suite: {
      functionName: 'markedParent', parameterOrder: ['root', 'target'], comparisonMode: 'EXACT',
      nativeSignature: { args: ['TreeNode', 'int'], returns: 'TreeNode', treeReferences: [{ argument: 1, root: 0 }], treeResult: 'value' },
    },
    input: { root: [12, null, 7], target: 7 }, expected: 12,
    solution: 'function markedParent(root: TreeNode|null, target: TreeNode): TreeNode|null { return root && root.right === target ? root : null; }',
  },
  {
    label: 'Java codec round trip', language: 'java',
    suite: {
      functionName: 'save', parameterOrder: ['root'], comparisonMode: 'EXACT',
      nativeSignature: { args: ['TreeNode'], returns: 'TreeNode', treeCodec: { deserialize: 'load', className: 'Codec' } },
    },
    input: { root: [3, -4] }, expected: [3, -4],
    solution: 'public class Codec { String save(TreeNode r) { return r.val + "," + r.left.val; } TreeNode load(String s) { String[] a = s.split(","); return new TreeNode(Integer.parseInt(a[0]), new TreeNode(Integer.parseInt(a[1])), null); } }',
  },
  {
    label: 'C row and column out parameters', language: 'c',
    suite: {
      functionName: 'identity', parameterOrder: ['grid'], comparisonMode: 'EXACT',
      nativeSignature: { args: ['int[][]'], returns: 'int[][]' },
    },
    input: { grid: [[8], [], [2, -4]] }, expected: [[8], [], [2, -4]],
    solution: 'int **identity(int **grid, int rows, int *widths, int *outRows, int **outWidths) { *outRows = rows; *outWidths = widths; return grid; }',
  },
];

describe.skipIf(!endpoint)('Judge0 runtime registry on an authorized live endpoint', () => {
  const execute = judge0(endpoint, process.env.PRACTICE_LIVE_JUDGE0_TOKEN, {
    rapidApiKey: process.env.PRACTICE_LIVE_JUDGE0_RAPIDAPI_KEY,
  });

  it.each(Object.entries(code) as Array<[PracticeLanguage, string]>)('runs generated %s', async (language, solution) => {
    const program = buildDriver(language, suite, '{"head":[53,-7,0]}', solution);
    const result = await execute(program, language);
    expect(result.status, result.compileOutput || result.stderr).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual([-7, 0]);
  }, 25_000);

  it.each(specialDrivers.map((example, i) => ({ ...example, language: fixtureLanguages[i]! })))(
    'runs the $name contract in $language', async ({ suite, input, output, code, language }) => {
      const program = buildDriver(language, suite, JSON.stringify(input), code[language]);
      const result = await execute(program, language);
      expect(result.status, result.compileOutput || result.stderr).toBe(3);
      expect(JSON.parse(result.stdout)).toEqual(output);
    }, 25_000,
  );

  it.each(advanced)('runs $label', async ({ language, suite, input, solution, expected }) => {
    const program = buildDriver(language, suite, JSON.stringify(input), solution);
    const result = await execute(program, language);
    expect(result.status, result.compileOutput || result.stderr).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual(expected);
  }, 25_000);
});
