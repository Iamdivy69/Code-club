import { AppError } from '../../errors.js';

export const fixtureShapes = {
  versionBoundary: { args: ['int', 'int'], returns: 'int' },
  linkedCycle: { args: ['ListNode', 'int'], returns: 'bool' },
  sharedListTail: { args: ['ListNode', 'ListNode', 'int', 'int', 'int'], returns: 'ListNode' },
} as const;

export type FixtureKind = keyof typeof fixtureShapes;
type Language = 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'c';

function invalidFixture(): never {
  throw new AppError(503, 'SUITE_INVALID', 'The test input does not match the problem fixture.');
}

// The surrounding driver validates the fixture's declared JSON types before this step.
export function prepareFixture(fixture: FixtureKind, args: unknown[]) {
  if (fixture === 'versionBoundary') {
    const [count, first] = args as [number, number];
    if (count < 1 || first < 1 || first > count) invalidFixture();
    return { inputs: args.slice(0, 1), boundary: first };
  }
  if (fixture === 'linkedCycle') {
    const [head, position] = args as [number[], number];
    if (position < -1 || position >= head.length) invalidFixture();
    return { inputs: args };
  }
  const [left, right, intersect, skipLeft, skipRight] = args as [number[], number[], number, number, number];
  if (skipLeft < 0 || skipRight < 0 || skipLeft > left.length || skipRight > right.length) invalidFixture();
  if (intersect === 0) return { inputs: [left, right, []] };
  const tail = left.slice(skipLeft);
  const matching = right.slice(skipRight);
  if (tail[0] !== intersect || tail.length !== matching.length || tail.some((value, i) => value !== matching[i])) invalidFixture();
  return { inputs: [left.slice(0, skipLeft), right.slice(0, skipRight), tail] };
}

export function boundaryPrelude(language: Language, first: number) {
  if (language === 'python') return 'def isBadVersion(version):\n    return version >= ' + first + '\n';
  if (language === 'java') return 'class VersionControl { protected boolean isBadVersion(int version) { return version >= ' + first + '; } }\n';
  if (language === 'c' || language === 'cpp') return 'static bool isBadVersion(int version) { return version >= ' + first + '; }\n';
  return '';
}

export function fixtureCallArguments(language: Language, fixture: FixtureKind | undefined, pass: string[]) {
  const prefix = language === 'java' ? 'PracticeList.' : language === 'cpp' ? 'practice_nodes::' : '_practice_list_';
  if (fixture === 'linkedCycle') return [prefix + 'cycle(' + pass[0] + ', ' + pass[1] + ')'];
  if (fixture === 'sharedListTail') return pass.slice(0, 2).map((name) => prefix + 'append(' + name + ', ' + pass[2] + ')');
  return pass;
}
