import type { PracticeLanguage } from '../src/modules/practice/contracts.js';
import type { Suite } from '../src/modules/practice/drivers.js';

type Example = {
  name: string;
  suite: Suite;
  input: Record<string, unknown>;
  output: unknown;
  code: Record<PracticeLanguage, string>;
};

function suite(functionName: string, parameterOrder: string[], nativeSignature: unknown): Suite {
  return { functionName, parameterOrder, comparisonMode: 'EXACT', nativeSignature };
}

const threshold: Example = {
  name: 'version-boundary',
  suite: suite('firstFault', ['count', 'first'], { args: ['int', 'int'], returns: 'int', fixture: 'versionBoundary', pythonClass: 'Solution' }),
  input: { count: 74, first: 63 },
  output: 63,
  code: {
    javascript: 'function solution(isBadVersion) { return count => { for (let i=1;i<=count;i++) if(isBadVersion(i)) return i; return 0; }; }',
    typescript: 'function solution(test: (i: number) => boolean): (count: number) => number { return count => { for(let i=1;i<=count;i++) if(test(i)) return i; return 0; }; }',
    python: 'class Solution:\n    def firstFault(self, count):\n        return next(i for i in range(1, count + 1) if isBadVersion(i))',
    java: 'class Solution extends VersionControl { int firstFault(int count) { for(int i=1;i<=count;i++) if(isBadVersion(i)) return i; return 0; } }',
    cpp: 'class Solution { public: int firstFault(int count) { for(int i=1;i<=count;i++) if(isBadVersion(i)) return i; return 0; } };',
    c: 'int firstFault(int count) { for(int i=1;i<=count;i++) if(isBadVersion(i)) return i; return 0; }',
  },
};

const cycle: Example = {
  name: 'linked-cycle',
  suite: suite('linksLoop', ['head', 'position'], { args: ['ListNode', 'int'], returns: 'bool', fixture: 'linkedCycle', pythonClass: 'Solution' }),
  input: { head: [28, 28, 4, -8], position: 3 },
  output: true,
  code: {
    javascript: 'function linksLoop(head) { const seen = new Set(); while(head){ if(seen.has(head)) return true; seen.add(head); head=head.next; } return false; }',
    typescript: 'function linksLoop(head: ListNode|null): boolean { const seen = new Set<ListNode>(); while(head){ if(seen.has(head)) return true; seen.add(head); head=head.next; } return false; }',
    python: 'class Solution:\n    def linksLoop(self, head):\n        seen = set()\n        while head:\n            if head in seen: return True\n            seen.add(head)\n            head = head.next\n        return False',
    java: 'class Solution { boolean linksLoop(ListNode head) { Set<ListNode> seen = new HashSet<>(); while(head!=null){ if(!seen.add(head)) return true; head=head.next; } return false; } }',
    cpp: 'class Solution { public: bool linksLoop(ListNode* head) { set<ListNode*> seen; while(head){ if(!seen.insert(head).second) return true; head=head->next; } return false; } };',
    c: 'bool linksLoop(ListNode* head) { ListNode* slow=head; ListNode* fast=head; while(fast && fast->next){ slow=slow->next; fast=fast->next->next; if(slow==fast) return true; } return false; }',
  },
};

const shared: Example = {
  name: 'shared-tail',
  suite: suite('sharedHead', ['left', 'right', 'intersect', 'skipLeft', 'skipRight'], {
    args: ['ListNode', 'ListNode', 'int', 'int', 'int'], returns: 'ListNode', fixture: 'sharedListTail', pythonClass: 'Solution',
  }),
  input: { left: [17, 5, 5], right: [5, 17, 5, 5], intersect: 5, skipLeft: 1, skipRight: 2 },
  output: 5,
  code: {
    javascript: 'function sharedHead(a,b){ let x=a,y=b; while(x!==y){x=x?x.next:b;y=y?y.next:a;} return x; }',
    typescript: 'function sharedHead(a:ListNode|null,b:ListNode|null):ListNode|null{let x=a,y=b;while(x!==y){x=x?x.next:b;y=y?y.next:a;}return x;}',
    python: 'class Solution:\n    def sharedHead(self, a, b):\n        x,y=a,b\n        while x is not y:\n            x=x.next if x else b\n            y=y.next if y else a\n        return x',
    java: 'class Solution { ListNode sharedHead(ListNode a,ListNode b){ListNode x=a,y=b; while(x!=y){ x=x==null?b:x.next; y=y==null?a:y.next; } return x;} }',
    cpp: 'class Solution { public: ListNode* sharedHead(ListNode* a,ListNode* b){ListNode *x=a,*y=b;while(x!=y){x=x?x->next:b;y=y?y->next:a;}return x;} };',
    c: 'ListNode* sharedHead(ListNode* a,ListNode* b){ListNode *x=a,*y=b;while(x!=y){x=x?x->next:b;y=y?y->next:a;}return x;}',
  },
};

const listArray: Example = {
  name: 'array-of-list-heads',
  suite: suite('selectList', ['lists'], { args: ['ListNode[]'], returns: 'ListNode', pythonClass: 'Solution' }),
  input: { lists: [[], [11, 14], [], [22]] },
  output: [11, 14],
  code: {
    javascript: 'function selectList(lists) { return lists.find(x => x) || null; }',
    typescript: 'function selectList(lists: Array<ListNode|null>): ListNode|null { return lists.find(x => x) || null; }',
    python: 'class Solution:\n    def selectList(self, lists):\n        return next((node for node in lists if node), None)',
    java: 'class Solution { ListNode selectList(ListNode[] lists){ for(ListNode node:lists) if(node!=null) return node; return null; } }',
    cpp: 'class Solution { public: ListNode* selectList(vector<ListNode*>& lists){for(ListNode* node:lists) if(node) return node; return nullptr;} };',
    c: 'ListNode* selectList(ListNode** lists,int count){for(int i=0;i<count;i++) if(lists[i]) return lists[i]; return NULL;}',
  },
};

const unsigned: Example = {
  name: 'unsigned-bits',
  suite: suite('setLowBit', ['word'], { args: ['uint32'], returns: 'uint32', pythonClass: 'Solution' }),
  input: { word: 2147483648 },
  output: 2147483649,
  code: {
    javascript: 'function setLowBit(word){return (word | 1) >>> 0;}',
    typescript: 'function setLowBit(word:number):number{return (word | 1) >>> 0;}',
    python: 'class Solution:\n    def setLowBit(self, word):\n        return word | 1',
    java: 'class Solution { int setLowBit(int word){return word | 1;} }',
    cpp: 'class Solution { public: uint32_t setLowBit(uint32_t word){return word | 1;} };',
    c: 'uint32_t setLowBit(uint32_t word){return word | 1;}',
  },
};

const graph: Example = {
  name: 'graph-adjacency',
  suite: suite('invertOrder', ['edges'], { args: ['GraphNode'], returns: 'GraphNode', pythonClass: 'Solution' }),
  input: { edges: [[2, 3], [1, 3], [1, 2]] },
  output: [[3, 2], [3, 1], [2, 1]],
  code: {
    javascript: 'function invertOrder(root){ if(!root) return null; for(const node of [root,...root.neighbors]) node.neighbors.reverse(); return root; }',
    typescript: 'function invertOrder(root: Node|null):Node|null{ if(!root) return null; for(const node of [root,...root.neighbors]) node.neighbors.reverse(); return root; }',
    python: 'class Solution:\n    def invertOrder(self, root):\n        if not root: return None\n        for node in [root, *root.neighbors]:\n            node.neighbors.reverse()\n        return root',
    java: 'class Solution { Node invertOrder(Node root){if(root==null) return null; List<Node> vertices=new ArrayList<>(root.neighbors);vertices.add(root); for(Node n:vertices) Collections.reverse(n.neighbors);return root;} }',
    cpp: 'class Solution { public: Node* invertOrder(Node* root){if(!root) return nullptr; auto nodes=root->neighbors;nodes.push_back(root);for(auto n:nodes) reverse(n->neighbors.begin(),n->neighbors.end());return root;} };',
    c: 'Node* invertOrder(Node* root){if(!root)return NULL; Node* vertices[]={root,root->neighbors[0],root->neighbors[1]};for(int i=0;i<3;i++){Node* v=vertices[i]; Node* first=v->neighbors[0];v->neighbors[0]=v->neighbors[1];v->neighbors[1]=first;}return root;}',
  },
};

export const specialDrivers = [threshold, cycle, shared, listArray, unsigned, graph];

export const fixtureEdgeCases: Example[] = [
  { ...cycle, name: 'acyclic-duplicate-values', input: { head: [3, 3, 3], position: -1 }, output: false },
  { ...shared, name: 'disjoint-identical-values', input: { left: [5, 12], right: [5, 12], intersect: 0, skipLeft: 2, skipRight: 2 }, output: null },
  { ...listArray, name: 'empty-list-array', input: { lists: [] }, output: [] },
  { ...graph, name: 'empty-graph', input: { edges: [] }, output: [] },
];
