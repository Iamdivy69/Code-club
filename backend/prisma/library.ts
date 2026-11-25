import { Prisma, type PrismaClient } from '@prisma/client';
import { seedDesignLibrary } from './design-library.js';
import type { PracticeLanguage } from '../src/modules/practice/contracts.js';

type Arg = 'int' | 'int[]' | 'string' | 'ListNode' | 'TreeNode';
type Starters = Partial<Record<PracticeLanguage, string>>;
type BasicSignature = { params: Array<[name: string, type: Arg]>; returns?: 'ListNode' | 'TreeNode' };
type AuthoredSignature = { parameterOrder: string[]; signature: Prisma.InputJsonObject; starters: Starters };
type ProblemSource = {
  slug: string; title: string; fn: string;
  topic: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; description: string; constraints: string;
  hint: string; editorial: string; cases: Array<[input: Record<string, unknown>, result: unknown]>;
} & (BasicSignature | AuthoredSignature);
const library: ProblemSource[] = [
  {
    slug: 'count-above', title: 'Count Above a Threshold', fn: 'countAbove', params: [['values', 'int[]'], ['threshold', 'int']],
    topic: 'Arrays', difficulty: 'EASY', description: 'Given an array of integers and a threshold, return how many values are strictly greater than the threshold. Include repeated values in the count.',
    constraints: '0 ≤ values.length ≤ 10,000\n−10⁹ ≤ values[i], threshold ≤ 10⁹', hint: 'Scan the array once and increase a counter on each strict match.',
    editorial: 'Start a counter at zero. Visit each value exactly once and increment the counter when the value is greater than the threshold. Equal values do not count. This takes O(n) time and O(1) extra space.',
    cases: [[{ values: [1, 6, 3, 8], threshold: 4 }, 2], [{ values: [3, 3, 1], threshold: 3 }, 0], [{ values: [], threshold: 7 }, 0], [{ values: [-11, -3, -3, 17, 0], threshold: -4 }, 4]],
  },
  {
    slug: 'first-decrease', title: 'First Decrease', fn: 'firstDecrease', params: [['values', 'int[]']],
    topic: 'Arrays', difficulty: 'EASY', description: 'Find the first index i where values[i] is strictly smaller than values[i − 1]. Return −1 when no such index exists.',
    constraints: '0 ≤ values.length ≤ 10,000\nIndices are zero based.', hint: 'The scan starts at index 1.',
    editorial: 'Compare each adjacent pair in increasing index order. Return the right-hand index of the first decrease. If the loop finishes, return −1. The complexity is O(n) time and O(1) space.',
    cases: [[{ values: [2, 3, 3, 1, 2] }, 3], [{ values: [1, 1, 2] }, -1], [{ values: [] }, -1], [{ values: [8, 2, 1] }, 1]],
  },
  {
    slug: 'longest-level-run', title: 'Longest Level Run', fn: 'longestRun', params: [['values', 'int[]']],
    topic: 'Arrays', difficulty: 'MEDIUM', description: 'Return the largest number of adjacent elements that all have the same value. An empty array has a run length of zero.',
    constraints: '0 ≤ values.length ≤ 10,000', hint: 'Track a current run and the best run.',
    editorial: 'When an element equals its predecessor, extend the current run by one. Otherwise begin a run of length one. Keep the maximum as each run grows. This takes O(n) time and O(1) space.',
    cases: [[{ values: [2, 2, 1, 3, 3, 3] }, 3], [{ values: [1, 2, 1] }, 1], [{ values: [] }, 0], [{ values: [-2, -2, -2, -1, -1] }, 3]],
  },
  {
    slug: 'strongest-window', title: 'Strongest Window', fn: 'strongestWindow', params: [['values', 'int[]'], ['width', 'int']],
    topic: 'Arrays', difficulty: 'MEDIUM', description: 'Return the largest sum of any contiguous window of exactly width elements.',
    constraints: '1 ≤ width ≤ values.length ≤ 10,000\n−100 ≤ values[i] ≤ 100', hint: 'When the window advances, one value leaves and one enters.',
    editorial: 'Sum the first window and use it as the initial best. For each step, subtract the outgoing value and add the incoming value. Update the best using the new sum. The scan takes O(n) time and O(1) extra space.',
    cases: [[{ values: [3, -2, 7, 4], width: 2 }, 11], [{ values: [-5, -2, -3], width: 2 }, -5], [{ values: [-1], width: 1 }, -1], [{ values: [7, -10, 8, 3, -1], width: 3 }, 10]],
  },
  {
    slug: 'letter-transitions', title: 'Letter Transitions', fn: 'transitions', params: [['text', 'string']],
    topic: 'Strings', difficulty: 'EASY', description: 'Count the positions at which a lowercase letter differs from the letter immediately before it.',
    constraints: '0 ≤ text.length ≤ 10,000\nThe input uses lowercase English letters.', hint: 'Adjacent equal letters contribute zero.',
    editorial: 'For each position from one onward, compare that letter with the preceding one. Count unequal pairs. The solution takes O(n) time and O(1) extra space.',
    cases: [[{ text: 'aabbac' }, 3], [{ text: 'aa' }, 0], [{ text: '' }, 0], [{ text: 'ababa' }, 4]],
  },
  {
    slug: 'shared-prefix-length', title: 'Shared Prefix Length', fn: 'sharedPrefixLength', params: [['left', 'string'], ['right', 'string']],
    topic: 'Strings', difficulty: 'EASY', description: 'Return the length of the longest prefix that is identical in both input strings.',
    constraints: 'Each input contains 0 to 10,000 lowercase English letters.', hint: 'Stop at the first difference or at the end of the shorter word.',
    editorial: 'Advance a single index while both strings still have a character at that index and the characters match. Return the index. The scan takes O(min(n, m)) time and O(1) space.',
    cases: [[{ left: 'brick', right: 'bridge' }, 3], [{ left: 'same', right: 'same' }, 4], [{ left: '', right: 'hello' }, 0], [{ left: 'prefix', right: 'pre' }, 3]],
  },
  {
    slug: 'drop-matching-links', title: 'Drop Matching Links', fn: 'dropMatching', params: [['head', 'ListNode'], ['value', 'int']], returns: 'ListNode',
    topic: 'Linked Lists', difficulty: 'EASY', description: 'Remove every node with the given value from a singly linked list. Return the head of the remaining list and preserve its order.',
    constraints: '0 ≤ number of nodes ≤ 10,000\nEach node has val and next fields. Arrays represent the list from head to tail.',
    hint: 'A dummy head lets you unlink matching nodes with the same logic at every position.',
    editorial: 'Attach the head to a dummy node. Keep a pointer to the last retained node. Inspect its successor and bypass it when the value matches. Advance the pointer only when retaining the successor. Return the dummy node’s successor. This takes O(n) time and O(1) extra space.',
    cases: [[{ head: [3, 3, 1, 3, 2], value: 3 }, [1, 2]], [{ head: [], value: 9 }, []], [{ head: [7, 7, 7], value: 7 }, []], [{ head: [4, -8, 4, -8], value: -8 }, [4, 4]]],
  },
  {
    slug: 'clip-tree-leaves', title: 'Clip Tree Leaves', fn: 'clipLeaves', params: [['root', 'TreeNode']], returns: 'TreeNode',
    topic: 'Trees', difficulty: 'MEDIUM', description: 'Remove all nodes that are leaves in the original binary tree and return its remaining root. A node that becomes a leaf during removal stays in the tree.',
    constraints: '0 ≤ number of nodes ≤ 1,000\nEach node has val, left and right fields. Level-order arrays use null for missing children.',
    hint: 'Test whether a node is a leaf before visiting its children.',
    editorial: 'Return null for an empty root or for a node whose two children are missing. Otherwise process the children and replace each child with its result. Return the original node. This takes O(n) time and O(h) call-stack space for height h.',
    cases: [[{ root: [4, 2, 6, null, 3, 5, 7] }, [4, 2, 6]], [{ root: [11] }, []], [{ root: [1, null, 2, null, 3] }, [1, null, 2]], [{ root: [] }, []]],
  },
  {
    slug: 'shared-branch', title: 'Shared Branch', fn: 'sharedBranch', topic: 'Trees', difficulty: 'MEDIUM',
    description: 'Two marked nodes sit in a binary tree. Return the deepest node that is an ancestor of both marked nodes. A marked node can be its own ancestor.',
    constraints: 'The input contains 1 to 1,000 nodes with distinct integer values.\nThe runner resolves first and second to the nodes with those values and reads the value of the returned node.',
    hint: 'If the two targets are found in different child subtrees, their shared ancestor is the current node.',
    editorial: 'Search both child subtrees. Return the current node when it is a marked node or when both child searches find a target. Otherwise return the result from the child that found a target. This takes O(n) time and O(h) stack space.',
    parameterOrder: ['root', 'first', 'second'],
    signature: { args: ['TreeNode', 'int', 'int'], returns: 'TreeNode', pythonClass: 'Solution', treeResult: 'value',
      treeReferences: [{ argument: 1, root: 0 }, { argument: 2, root: 0 }] },
    starters: {
      javascript: 'function sharedBranch(root, first, second) {\n  return null;\n}\n',
      typescript: 'function sharedBranch(root: TreeNode | null, first: TreeNode, second: TreeNode): TreeNode | null {\n  return null;\n}\n',
      python: 'class Solution:\n    def sharedBranch(self, root, first, second):\n        return None\n',
      java: 'class Solution {\n    public TreeNode sharedBranch(TreeNode root, TreeNode first, TreeNode second) {\n        return null;\n    }\n}\n',
      cpp: 'class Solution {\npublic:\n    TreeNode* sharedBranch(TreeNode* root, TreeNode* first, TreeNode* second) {\n        return nullptr;\n    }\n};\n',
      c: 'TreeNode* sharedBranch(TreeNode* root, TreeNode* first, TreeNode* second) {\n    return NULL;\n}\n',
    },
    cases: [
      [{ root: [42, 15, 90, 5, null, 71, 104], first: 5, second: 71 }, 42],
      [{ root: [5, null, 12, 9, 16], first: 9, second: 16 }, 12],
      [{ root: [13, 7, 26, null, 10], first: 7, second: 10 }, 7],
      [{ root: [2147483647], first: 2147483647, second: 2147483647 }, 2147483647],
    ],
  },
  {
    slug: 'tree-checkpoint', title: 'Tree Checkpoint', fn: 'saveTree', topic: 'Trees', difficulty: 'HARD',
    description: 'Encode a binary tree as text with saveTree and rebuild it from that text with restoreTree. The restored tree must have the same values and child positions.',
    constraints: 'The tree contains at most 1,000 nodes.\nAn empty tree is allowed. Node values can repeat. The judge checks the tree after a save and restore round trip.',
    hint: 'Record a marker for each missing child so that repeated values and sparse branches can be reconstructed.',
    editorial: 'Write values in preorder with a distinct token for each missing child. Read each token in that order to reconstruct its node and its two children. Both operations take O(n) time and O(n) space.',
    parameterOrder: ['root'],
    signature: { args: ['TreeNode'], returns: 'TreeNode', treeCodec: { deserialize: 'restoreTree', className: 'Codec' } },
    starters: {
      javascript: 'function saveTree(root) {\n  return "";\n}\n\nfunction restoreTree(text) {\n  return null;\n}\n',
      typescript: 'function saveTree(root: TreeNode | null): string {\n  return "";\n}\n\nfunction restoreTree(text: string): TreeNode | null {\n  return null;\n}\n',
      python: 'class Codec:\n    def saveTree(self, root):\n        return ""\n\n    def restoreTree(self, text):\n        return None\n',
      java: 'class Codec {\n    public String saveTree(TreeNode root) { return ""; }\n    public TreeNode restoreTree(String text) { return null; }\n}\n',
      cpp: 'class Codec {\npublic:\n    string saveTree(TreeNode* root) { return ""; }\n    TreeNode* restoreTree(string text) { return nullptr; }\n};\n',
      c: 'char* saveTree(TreeNode* root) { return ""; }\nTreeNode* restoreTree(char* text) { return NULL; }\n',
    },
    cases: [
      [{ root: [8, null, 11, 8, 17] }, [8, null, 11, 8, 17]],
      [{ root: [] }, []],
      [{ root: [-4, 0, null, -4] }, [-4, 0, null, -4]],
      [{ root: [1, 1, 1, null, 1, null, 1] }, [1, 1, 1, null, 1, null, 1]],
    ],
  },
  {
    slug: 'row-endpoints', title: 'Row Endpoints', fn: 'rowEndpoints', topic: 'Matrices', difficulty: 'EASY',
    description: 'For each row, return a row containing its first and last value. Preserve the original row order. An empty row stays empty, and a single value appears twice.',
    constraints: 'The matrix has at most 1,000 rows and 10,000 cells.\nRows can have different lengths.',
    hint: 'Only the length, first index, and last index of each row are needed.',
    editorial: 'Visit each row. Append an empty result if it contains no values. Otherwise append its first and last entries. The work and output are proportional to the number of rows.',
    parameterOrder: ['grid'], signature: { args: ['int[][]'], returns: 'int[][]', pythonClass: 'Solution' },
    starters: {
      javascript: 'function rowEndpoints(grid) {\n  return [];\n}\n',
      typescript: 'function rowEndpoints(grid: number[][]): number[][] {\n  return [];\n}\n',
      python: 'class Solution:\n    def rowEndpoints(self, grid):\n        return []\n',
      java: 'class Solution {\n    public List<List<Integer>> rowEndpoints(int[][] grid) {\n        return new ArrayList<>();\n    }\n}\n',
      cpp: 'class Solution {\npublic:\n    vector<vector<int>> rowEndpoints(vector<vector<int>>& grid) {\n        return {};\n    }\n};\n',
      c: 'int** rowEndpoints(int** grid, int rows, int* widths, int* returnSize, int** returnColumnSizes) {\n    *returnSize = 0;\n    *returnColumnSizes = NULL;\n    return NULL;\n}\n',
    },
    cases: [
      [{ grid: [[3, 8, -9], [], [7]] }, [[3, -9], [], [7, 7]]],
      [{ grid: [] }, []],
      [{ grid: [[0], [5, 9, 1, 6, 10], []] }, [[0, 0], [5, 10], []]],
      [{ grid: [[], []] }, [[], []]],
    ],
  },
  {
    slug: 'first-failing-reading', title: 'First Failing Reading', fn: 'firstFault', topic: 'Binary Search', difficulty: 'EASY',
    description: 'The readings are numbered from 1 through count. Once a reading fails, every later reading fails. Return the first failing number by querying isBadVersion.',
    constraints: '1 ≤ count ≤ 2,147,483,647\nAt least one reading fails. The first parameter gives the reading count. The first failing number configures the judge callback.',
    hint: 'If a reading fails, keep it as a possible answer and search the earlier readings.',
    editorial: 'Keep the first failing reading inside a closed interval. Query the midpoint and move the upper bound to the midpoint on failure. On success, move the lower bound past the midpoint. This takes O(log count) queries and O(1) space.',
    parameterOrder: ['count', 'first'],
    signature: { args: ['int', 'int'], returns: 'int', fixture: 'versionBoundary', pythonClass: 'Solution' },
    starters: {
      javascript: 'function solution(isBadVersion) {\n  return function firstFault(count) {\n    return 0;\n  };\n}\n',
      typescript: 'function solution(isBadVersion: (reading: number) => boolean) {\n  return function firstFault(count: number): number {\n    return 0;\n  };\n}\n',
      python: 'class Solution:\n    def firstFault(self, count):\n        return 0\n',
      java: 'class Solution extends VersionControl {\n    public int firstFault(int count) { return 0; }\n}\n',
      cpp: 'class Solution {\npublic:\n    int firstFault(int count) { return 0; }\n};\n',
      c: 'int firstFault(int count) {\n    return 0;\n}\n',
    },
    cases: [[{ count: 12, first: 9 }, 9], [{ count: 1, first: 1 }, 1], [{ count: 2147483647, first: 2147483647 }, 2147483647], [{ count: 194, first: 1 }, 1]],
  },
  {
    slug: 'first-shared-relay', title: 'First Shared Relay', fn: 'sharedRelay', topic: 'Linked Lists', difficulty: 'MEDIUM',
    description: 'Two relay routes are singly linked lists. They can join at a relay and share every subsequent relay by identity. Return the first shared node, or null when the routes never join.',
    constraints: 'Each route has at most 1,000 nodes. Equal relay values do not imply matching identity.\nshared = 0 describes disjoint routes. Otherwise, leftSkip and rightSkip give the zero-based join positions.',
    hint: 'Switch heads when a pointer reaches the end of a list so both pointers travel the same total distance.',
    editorial: 'Walk both routes with separate pointers. At the end of a route, move that pointer to the head of the other route. Each pointer travels both prefix lengths before meeting at the join or at null. This takes O(a + b) time and O(1) space.',
    parameterOrder: ['left', 'right', 'shared', 'leftSkip', 'rightSkip'],
    signature: { args: ['ListNode', 'ListNode', 'int', 'int', 'int'], returns: 'ListNode', fixture: 'sharedListTail', pythonClass: 'Solution' },
    starters: {
      javascript: 'function sharedRelay(left, right) {\n  return null;\n}\n',
      typescript: 'function sharedRelay(left: ListNode | null, right: ListNode | null): ListNode | null {\n  return null;\n}\n',
      python: 'class Solution:\n    def sharedRelay(self, left, right):\n        return None\n',
      java: 'class Solution {\n    public ListNode sharedRelay(ListNode left, ListNode right) { return null; }\n}\n',
      cpp: 'class Solution {\npublic:\n    ListNode* sharedRelay(ListNode* left, ListNode* right) { return nullptr; }\n};\n',
      c: 'ListNode* sharedRelay(ListNode* left, ListNode* right) {\n    return NULL;\n}\n',
    },
    cases: [
      [{ left: [2, 14, 9], right: [8, 7, 14, 9], shared: 14, leftSkip: 1, rightSkip: 2 }, 14],
      [{ left: [2, 2], right: [2, 2], shared: 0, leftSkip: 2, rightSkip: 2 }, null],
      [{ left: [99], right: [99], shared: 99, leftSkip: 0, rightSkip: 0 }, 99],
      [{ left: [], right: [7], shared: 0, leftSkip: 0, rightSkip: 1 }, null],
    ],
  },
  {
    slug: 'reverse-neighbor-order', title: 'Reverse Neighbor Order', fn: 'reverseNeighbors', topic: 'Graphs', difficulty: 'MEDIUM',
    description: 'Given the root of a connected graph, reverse the order of each vertex’s neighbor list. Keep the same edges and return the root. An empty graph has a null root.',
    constraints: 'The graph has at most 1,000 vertices. Labels are 1 through the number of vertices.\nThe input and result list neighbor labels in ascending vertex-label order.',
    hint: 'Mark visited vertices so a cycle does not lead to repeated work.',
    editorial: 'Traverse the graph from the root with a queue or stack. Visit each vertex once and reverse its neighbor list. The total work is O(V + E) with O(V) auxiliary space.',
    parameterOrder: ['edges'],
    signature: { args: ['GraphNode'], returns: 'GraphNode', pythonClass: 'Solution' },
    starters: {
      javascript: 'function reverseNeighbors(root) {\n  return root;\n}\n',
      typescript: 'function reverseNeighbors(root: Node | null): Node | null {\n  return root;\n}\n',
      python: 'class Solution:\n    def reverseNeighbors(self, root):\n        return root\n',
      java: 'class Solution {\n    public Node reverseNeighbors(Node root) { return root; }\n}\n',
      cpp: 'class Solution {\npublic:\n    Node* reverseNeighbors(Node* root) { return root; }\n};\n',
      c: 'Node* reverseNeighbors(Node* root) {\n    return root;\n}\n',
    },
    cases: [
      [{ edges: [[2, 3], [1, 3], [1, 2]] }, [[3, 2], [3, 1], [2, 1]]],
      [{ edges: [] }, []],
      [{ edges: [[2, 3, 4], [1], [1], [1]] }, [[4, 3, 2], [1], [1], [1]]],
      [{ edges: [[]] }, [[]]],
    ],
  },
];

function starter(item: BasicSignature & { fn: string }): Starters {
  const names = item.params.map(([name]) => name).join(', ');
  const typescriptType = (type: Arg) => type === 'ListNode' || type === 'TreeNode' ? type + ' | null' : type.replace('int', 'number');
  const typed = item.params.map(([name, type]) => name + ': ' + typescriptType(type)).join(', ');
  const java = item.params.map(([name, type]) => type.replace('string', 'String') + ' ' + name).join(', ');
  const cpp = item.params.map(([name, type]) => ({ int: 'int', 'int[]': 'const vector<int>&', string: 'const string&', ListNode: 'ListNode*', TreeNode: 'TreeNode*' }[type]) + ' ' + name).join(', ');
  const c = item.params.flatMap(([name, type]) => {
    if (type === 'int[]') return ['const int* ' + name, 'int ' + name + 'Size'];
    if (type === 'ListNode' || type === 'TreeNode') return ['struct ' + type + '* ' + name];
    return ['int ' + name];
  }).join(', ');
  const returnType = item.returns ?? 'int';
  return {
    javascript: 'function ' + item.fn + '(' + names + ') {\n  // Write your solution here.\n}\n',
    typescript: 'function ' + item.fn + '(' + typed + '): ' + typescriptType(returnType) + ' {\n  // Write your solution here.\n  return ' + (item.returns ? 'null' : '0') + ';\n}\n',
    python: 'def ' + item.fn + '(' + names + '):\n    # Write your solution here.\n    pass\n',
    java: 'class Solution {\n    public ' + returnType + ' ' + item.fn + '(' + java + ') {\n        return ' + (item.returns ? 'null' : '0') + ';\n    }\n}\n',
    cpp: 'class Solution {\npublic:\n    ' + returnType + (item.returns ? '*' : '') + ' ' + item.fn + '(' + cpp + ') {\n        return ' + (item.returns ? 'nullptr' : '0') + ';\n    }\n};\n',
    ...(item.params.every(([, type]) => type !== 'string') ? { c: (item.returns ? 'struct ' + item.returns + '*' : 'int') + ' ' + item.fn + '(' + c + ') {\n    return ' + (item.returns ? 'NULL' : '0') + ';\n}\n' } : {}),
  };
}

export async function seedLibrary(db: PrismaClient) {
  await seedDesignLibrary(db);
  for (const item of library) {
    const starterCode = 'starters' in item ? item.starters : starter(item);
    const parameterOrder = 'parameterOrder' in item ? item.parameterOrder : item.params.map(([name]) => name);
    const nativeSignature = 'signature' in item ? item.signature : { args: item.params.map(([, type]) => type), returns: item.returns ?? 'int' };
    const contract = { functionName: item.fn, parameterOrder, enabled: true, nativeSignature, editorial: item.editorial };
    const cases = item.cases.map(([input, expected], index) => ({
      position: index % 2, hidden: index >= 2, inputJson: JSON.stringify(input), expectedOutputJson: JSON.stringify(expected),
    }));
    const row = await db.problem.findUnique({ where: { slug: item.slug }, select: { id: true, practiceContract: { select: { functionName: true } }, createdByUserId: true } });
    if (row) {
      // Extend the original starter fixture when upgrading an existing standalone database.
      if (item.slug === 'count-above' && !row.createdByUserId && row.practiceContract?.functionName === item.fn) {
        await db.problem.update({ where: { id: row.id }, data: { starterCode, practiceContract: {
          update: { nativeSignature: contract.nativeSignature, editorial: item.editorial },
        } } });
      }
      continue;
    }
    await db.problem.create({ data: {
      slug: item.slug, title: item.title, topic: item.topic, difficulty: item.difficulty, description: item.description,
      isPublished: true, hints: [item.hint], constraints: item.constraints, starterCode,
      practiceContract: { create: { ...contract, cases: { create: cases } } },
    } });
  }
  const stack = [
    { operations: ['Counter', 'add', 'value', 'undo', 'value'], arguments: [[], [7], [], [], []], result: [null, null, 7, null, 0] },
    { operations: ['Counter', 'value'], arguments: [[], []], result: [null, 0] },
    { operations: ['Counter', 'undo', 'add', 'add', 'undo', 'value'], arguments: [[], [], [1], [-4], [], []], result: [null, null, null, null, null, 1] },
  ];
  const counterStarters = {
    javascript: 'class Counter {\n  add(amount) {}\n  undo() {}\n  value() {}\n}',
    typescript: 'class Counter {\n  add(amount: number): void {}\n  undo(): void {}\n  value(): number { return 0; }\n}',
    python: 'class Counter:\n    def add(self, amount):\n        pass\n    def undo(self):\n        pass\n    def value(self):\n        pass\n',
  };
  const expandedStarters = {
    ...counterStarters,
    java: 'class Counter {\n    public void add(int amount) {}\n    public void undo() {}\n    public int value() { return 0; }\n}\n',
    cpp: 'class Counter {\npublic:\n    void add(int amount) {}\n    void undo() {}\n    int value() { return 0; }\n};\n',
    c: 'typedef struct Counter {\n    int total;\n} Counter;\n\nCounter* Counter_create(void) {\n    return calloc(1, sizeof(Counter));\n}\n\nvoid Counter_add(Counter* counter, int amount) {}\nvoid Counter_undo(Counter* counter) {}\nint Counter_value(Counter* counter) { return 0; }\n',
  };
  const originalDesign = { className: 'Counter', resultMode: 'all' };
  const counterDesign = {
    ...originalDesign,
    signatures: { constructorArgs: [], methods: { add: { args: ['int'], returns: 'void' }, undo: { args: [], returns: 'void' }, value: { args: [], returns: 'int' } } },
  };
  const counter = await db.problem.upsert({
    where: { slug: 'undo-counter' }, update: {}, create: {
      slug: 'undo-counter', title: 'Undo Counter', topic: 'Stacks', difficulty: 'MEDIUM', isPublished: true,
      description: 'Implement a Counter initialized to zero. add changes the total, undo reverses the most recent non-undone add, and value returns the total. Undo on an empty history changes nothing.',
      hints: ['Store each added amount on a stack.'],
      starterCode: expandedStarters,
      practiceContract: { create: {
        functionName: 'Counter', parameterOrder: [], enabled: true,
        nativeSignature: Prisma.JsonNull, designContract: counterDesign,
        editorial: 'Keep a running total and a stack of changes. Push each amount on add. On undo, pop and subtract that amount when the stack is nonempty. Each operation takes O(1) time.',
        cases: { create: stack.map(({ result, ...test }, index) => ({
          position: index < 2 ? index : 0, hidden: index >= 2, inputJson: JSON.stringify(test), expectedOutputJson: JSON.stringify(result),
        })) },
      } },
    },
    select: { id: true, createdByUserId: true, starterCode: true, practiceContract: { select: { designContract: true } } },
  });

  const currentStarters = counter.starterCode as Record<string, unknown> | null;
  const currentDesign = counter.practiceContract?.designContract as Record<string, unknown> | null;
  if (!counter.createdByUserId && currentStarters && Object.keys(currentStarters).length === 3 &&
    Object.entries(counterStarters).every(([key, value]) => currentStarters[key] === value) &&
    currentDesign && Object.keys(currentDesign).length === 2 && currentDesign.className === originalDesign.className && currentDesign.resultMode === originalDesign.resultMode) {
    await db.problem.update({
      where: { id: counter.id, starterCode: { equals: counterStarters }, practiceContract: { is: { designContract: { equals: originalDesign } } } },
      data: { starterCode: expandedStarters, practiceContract: { update: { designContract: counterDesign } } },
    });
  }
}
