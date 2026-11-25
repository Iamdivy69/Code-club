import { z } from 'zod';
import { graphInput, graphPrelude } from './graph.js';

export type NodeType = 'ListNode' | 'TreeNode' | 'GraphNode';
export const intValue = z.number().int().min(-2147483648).max(2147483647);

export const nodeInput = {
  ListNode: z.array(intValue),
  GraphNode: graphInput,
  TreeNode: z.array(intValue.nullable()).superRefine((values, ctx) => {
    if (!values.length) return;
    if (values[0] === null) {
      if (values.slice(1).some((value) => value !== null)) ctx.addIssue({ code: 'custom', message: 'A null root cannot have children.' });
      return;
    }
    let pending = 1;
    let next = 1;
    while (pending > 0 && next < values.length) {
      pending--;
      for (let child = 0; child < 2 && next < values.length; child++, next++) {
        if (values[next] !== null) pending++;
      }
    }
    if (values.slice(next).some((value) => value !== null)) ctx.addIssue({ code: 'custom', message: 'A tree node must have a parent.' });
  }),
};

export function isNodeType(type: string): type is NodeType {
  return type === 'ListNode' || type === 'TreeNode' || type === 'GraphNode';
}

export function nodePrelude(language: 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'c', types: ReadonlySet<NodeType>) {
  const graph = types.has('GraphNode') ? graphPrelude(language) : '';
  if (language === 'javascript' || language === 'typescript') {
    const typed = language === 'typescript';
    const value = typed ? ': number' : '';
    return [
      types.has('ListNode') ? `class ListNode {
  val` + value + `;
  next` + (typed ? ': ListNode | null' : '') + `;
  constructor(val` + value + ' = 0, next' + (typed ? ': ListNode | null' : '') + ` = null) { this.val = val; this.next = next; }
}
function _practice_list(values` + (typed ? ': number[]' : '') + `) {
  let head` + (typed ? ': ListNode | null' : '') + ` = null;
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
  return head;
}
function _practice_list_append(head` + (typed ? ': ListNode | null' : '') + `, tail` + (typed ? ': ListNode | null' : '') + `) {
  if (!head) return tail;
  let node = head;
  while (node.next) node = node.next;
  node.next = tail;
  return head;
}
function _practice_list_cycle(head` + (typed ? ': ListNode | null' : '') + `, position` + value + `) {
  if (!head || position === -1) return head;
  let node = head;
  let destination = head;
  for (let i = 0; i < position; i++) destination = destination.next` + (typed ? '!' : '') + `;
  while (node.next) node = node.next;
  node.next = destination;
  return head;
}
function _practice_list_value(head` + (typed ? ': ListNode | null' : '') + `) {
  return head == null ? null : head.val;
}
function _practice_list_json(head` + (typed ? ': ListNode | null' : '') + `) {
  const values = [];
  for (let node = head; node != null; node = node.next) values.push(node.val);
  return values;
}` : '',
      types.has('TreeNode') ? `class TreeNode {
  val` + value + `;
  left` + (typed ? ': TreeNode | null' : '') + `;
  right` + (typed ? ': TreeNode | null' : '') + `;
  constructor(val` + value + ' = 0, left' + (typed ? ': TreeNode | null' : '') + ' = null, right' + (typed ? ': TreeNode | null' : '') + ` = null) {
    this.val = val; this.left = left; this.right = right;
  }
}
function _practice_tree(values` + (typed ? ': (number | null)[]' : '') + `) {
  if (values[0] == null) return null;
  const nodes = [new TreeNode(values[0])];
  for (let i = 0, next = 1; i < nodes.length && next < values.length; i++) {
    const left = values[next++];
    const right = values[next++];
    if (left != null) { const child = new TreeNode(left); nodes[i].left = child; nodes.push(child); }
    if (right != null) { const child = new TreeNode(right); nodes[i].right = child; nodes.push(child); }
  }
  return nodes[0];
}
function _practice_tree_find(root` + (typed ? ': TreeNode | null' : '') + `, value` + value + `) {
  const pending = root ? [root] : [];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.val === value) return node;
    if (node.right) pending.push(node.right);
    if (node.left) pending.push(node.left);
  }
  return null;
}
function _practice_tree_value(root` + (typed ? ': TreeNode | null' : '') + `) {
  return root == null ? null : root.val;
}
function _practice_tree_json(root` + (typed ? ': TreeNode | null' : '') + `) {
  const nodes` + (typed ? ': (TreeNode | null)[]' : '') + ` = [root];
  const values = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    values.push(node == null ? null : node.val);
    if (node) nodes.push(node.left, node.right);
  }
  while (values.length && values[values.length - 1] === null) values.pop();
  return values;
}` : '',
      graph,
    ].join('\n');
  }

  const snippets = nodes[language];
  return [types.has('ListNode') ? snippets.ListNode : '', types.has('TreeNode') ? snippets.TreeNode : '', graph].join('\n');
}

const nodes = {
  python: {
    ListNode: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

def _practice_list(values):
    head = None
    for val in reversed(values):
        head = ListNode(val, head)
    return head

def _practice_list_append(head, tail):
    if head is None:
        return tail
    node = head
    while node.next is not None:
        node = node.next
    node.next = tail
    return head

def _practice_list_cycle(head, position):
    if head is None or position < 0:
        return head
    node, entry = head, head
    for _ in range(position):
        entry = entry.next
    while node.next is not None:
        node = node.next
    node.next = entry
    return head

def _practice_list_value(head):
    return None if head is None else head.val

def _practice_list_json(node):
    values = []
    while node is not None:
        values.append(node.val)
        node = node.next
    return values
`,
    TreeNode: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def _practice_tree(values):
    if not values or values[0] is None:
        return None
    nodes = [TreeNode(values[0])]
    vals = iter(values[1:])
    for node in nodes:
        left, right = next(vals, None), next(vals, None)
        if left is not None:
            node.left = TreeNode(left)
            nodes.append(node.left)
        if right is not None:
            node.right = TreeNode(right)
            nodes.append(node.right)
    return nodes[0]

def _practice_tree_find(root, value):
    pending = [root] if root is not None else []
    while pending:
        node = pending.pop()
        if node.val == value:
            return node
        if node.right is not None:
            pending.append(node.right)
        if node.left is not None:
            pending.append(node.left)
    return None

def _practice_tree_value(root):
    return None if root is None else root.val

def _practice_tree_json(root):
    nodes, values = [root], []
    for node in nodes:
        values.append(node.val if node is not None else None)
        if node is not None:
            nodes.extend((node.left, node.right))
    while values and values[-1] is None:
        values.pop()
    return values
`,
  },
  java: {
    ListNode: `class ListNode {
  int val; ListNode next;
  ListNode() {}
  ListNode(int val) { this(val, null); }
  ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
class PracticeList {
  static ListNode build(int[] values) {
    ListNode head = null;
    for (int i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
    return head;
  }
  static ListNode append(ListNode head, ListNode tail) {
    if (head == null) return tail;
    ListNode node = head;
    while (node.next != null) node = node.next;
    node.next = tail;
    return head;
  }
  static ListNode cycle(ListNode head, int position) {
    if (head == null || position < 0) return head;
    ListNode node = head, entry = head;
    for (int i = 0; i < position; i++) entry = entry.next;
    while (node.next != null) node = node.next;
    node.next = entry;
    return head;
  }
  static Integer value(ListNode head) { return head == null ? null : head.val; }
  static String json(ListNode node) {
    StringJoiner values = new StringJoiner(",", "[", "]");
    for (; node != null; node = node.next) values.add(Integer.toString(node.val));
    return values.toString();
  }
}`,
    TreeNode: `class TreeNode {
  int val; TreeNode left, right;
  TreeNode() {}
  TreeNode(int val) { this(val, null, null); }
  TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}
class PracticeTree {
  static TreeNode build(Integer[] values) {
    if (values.length == 0 || values[0] == null) return null;
    ArrayList<TreeNode> nodes = new ArrayList<>();
    nodes.add(new TreeNode(values[0]));
    for (int i = 0, next = 1; i < nodes.size() && next < values.length; i++) {
      TreeNode node = nodes.get(i);
      Integer left = values[next++], right = next < values.length ? values[next++] : null;
      if (left != null) { node.left = new TreeNode(left); nodes.add(node.left); }
      if (right != null) { node.right = new TreeNode(right); nodes.add(node.right); }
    }
    return nodes.get(0);
  }
  static TreeNode find(TreeNode root, int value) {
    Deque<TreeNode> pending = new ArrayDeque<>();
    if (root != null) pending.push(root);
    while (!pending.isEmpty()) {
      TreeNode node = pending.pop();
      if (node.val == value) return node;
      if (node.right != null) pending.push(node.right);
      if (node.left != null) pending.push(node.left);
    }
    return null;
  }
  static Integer value(TreeNode root) { return root == null ? null : root.val; }
  static String json(TreeNode root) {
    ArrayList<TreeNode> nodes = new ArrayList<>();
    ArrayList<String> values = new ArrayList<>();
    nodes.add(root);
    int end = 0;
    for (int i = 0; i < nodes.size(); i++) {
      TreeNode node = nodes.get(i);
      values.add(node == null ? "null" : Integer.toString(node.val));
      if (node != null) { end = i + 1; nodes.add(node.left); nodes.add(node.right); }
    }
    return "[" + String.join(",", values.subList(0, end)) + "]";
  }
}`,
  },
  cpp: {
    ListNode: `struct ListNode {
  int val; ListNode *next;
  ListNode(int val = 0, ListNode *next = nullptr) : val(val), next(next) {}
};
namespace practice_nodes {
  ListNode *list(const std::vector<int>& values) {
    ListNode *head = nullptr;
    for (auto i = values.rbegin(); i != values.rend(); i++) head = new ListNode(*i, head);
    return head;
  }
  ListNode *append(ListNode *head, ListNode *tail) {
    if (!head) return tail;
    ListNode *node = head;
    while (node->next) node = node->next;
    node->next = tail;
    return head;
  }
  ListNode *cycle(ListNode *head, int position) {
    if (!head || position < 0) return head;
    ListNode *node = head, *entry = head;
    for (int i = 0; i < position; i++) entry = entry->next;
    while (node->next) node = node->next;
    node->next = entry;
    return head;
  }
  void emitValue(ListNode *node) {
    if (node) std::cout << node->val;
    else std::cout << "null";
  }
  void emit(ListNode *node) {
    std::cout << '[';
    for (bool first = true; node; node = node->next) {
      if (!first) std::cout << ',';
      std::cout << node->val;
      first = false;
    }
    std::cout << ']';
  }
}`,
    TreeNode: `struct TreeNode {
  int val; TreeNode *left, *right;
  TreeNode(int val = 0, TreeNode *left = nullptr, TreeNode *right = nullptr) : val(val), left(left), right(right) {}
};
namespace practice_nodes {
  TreeNode *tree(const std::vector<long long>& values) {
    const long long missing = 2147483648LL;
    if (values.empty() || values[0] == missing) return nullptr;
    std::vector<TreeNode *> nodes{new TreeNode(static_cast<int>(values[0]))};
    for (size_t i = 0, next = 1; i < nodes.size() && next < values.size(); i++) {
      TreeNode *node = nodes[i];
      const auto left = values[next++];
      const auto right = next < values.size() ? values[next++] : missing;
      if (left != missing) { node->left = new TreeNode(static_cast<int>(left)); nodes.push_back(node->left); }
      if (right != missing) { node->right = new TreeNode(static_cast<int>(right)); nodes.push_back(node->right); }
    }
    return nodes[0];
  }
  TreeNode *find(TreeNode *root, int value) {
    std::vector<TreeNode *> pending;
    if (root) pending.push_back(root);
    while (!pending.empty()) {
      TreeNode *node = pending.back();
      pending.pop_back();
      if (node->val == value) return node;
      if (node->right) pending.push_back(node->right);
      if (node->left) pending.push_back(node->left);
    }
    return nullptr;
  }
  void emitValue(TreeNode *root) {
    if (root) std::cout << root->val;
    else std::cout << "null";
  }
  void emit(TreeNode *root) {
    std::vector<TreeNode *> nodes{root};
    size_t end = 0;
    for (size_t i = 0; i < nodes.size(); i++) {
      if (const auto node = nodes[i]) {
        end = i + 1;
        nodes.push_back(node->left);
        nodes.push_back(node->right);
      }
    }
    std::cout << '[';
    for (size_t i = 0; i < end; i++) {
      if (i) std::cout << ',';
      if (nodes[i]) std::cout << nodes[i]->val;
      else std::cout << "null";
    }
    std::cout << ']';
  }
}`,
  },
  c: {
    ListNode: `#ifndef CODECLUB_LISTNODE_DEFINED
#define CODECLUB_LISTNODE_DEFINED
typedef struct ListNode { int val; struct ListNode *next; } ListNode;
#endif

static ListNode *_practice_list(const int *values, size_t length) {
  ListNode *head = NULL;
  while (length) {
    ListNode *node = malloc(sizeof(*node));
    if (!node) exit(1);
    *node = (ListNode){ values[--length], head };
    head = node;
  }
  return head;
}

static ListNode *_practice_list_append(ListNode *head, ListNode *tail) {
  if (!head) return tail;
  ListNode *node = head;
  while (node->next) node = node->next;
  node->next = tail;
  return head;
}

static ListNode *_practice_list_cycle(ListNode *head, int position) {
  if (!head || position < 0) return head;
  ListNode *node = head, *entry = head;
  for (int i = 0; i < position; i++) entry = entry->next;
  while (node->next) node = node->next;
  node->next = entry;
  return head;
}

static void _practice_list_value(const ListNode *node) {
  if (node) printf("%d", node->val);
  else fputs("null", stdout);
}

static void _practice_list_json(const ListNode *node) {
  putchar('[');
  for (bool first = true; node; node = node->next) {
    if (!first) putchar(',');
    printf("%d", node->val);
    first = false;
  }
  putchar(']');
}`,
    TreeNode: `#ifndef CODECLUB_TREENODE_DEFINED
#define CODECLUB_TREENODE_DEFINED
typedef struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; } TreeNode;
#endif

static TreeNode *_practice_tree_node(int value) {
  TreeNode *node = calloc(1, sizeof(*node));
  if (!node) exit(1);
  node->val = value;
  return node;
}

static TreeNode *_practice_tree(const long long *values, size_t length) {
  const long long missing = 2147483648LL;
  if (!length || values[0] == missing) return NULL;
  TreeNode **nodes = malloc(length * sizeof(*nodes));
  if (!nodes) exit(1);
  TreeNode *root = nodes[0] = _practice_tree_node((int)values[0]);
  size_t used = 1, next = 1;
  for (size_t i = 0; i < used && next < length; i++) {
    TreeNode *node = nodes[i];
    const long long left = values[next++];
    const long long right = next < length ? values[next++] : missing;
    if (left != missing) nodes[used++] = node->left = _practice_tree_node((int)left);
    if (right != missing) nodes[used++] = node->right = _practice_tree_node((int)right);
  }
  free(nodes);
  return root;
}

static TreeNode *_practice_tree_find(TreeNode *root, int value) {
  if (!root || root->val == value) return root;
  TreeNode *left = _practice_tree_find(root->left, value);
  return left ? left : _practice_tree_find(root->right, value);
}

static void _practice_tree_value(const TreeNode *root) {
  if (root) printf("%d", root->val);
  else fputs("null", stdout);
}

static void _practice_tree_json(const TreeNode *root) {
  size_t capacity = 16, used = 1, end = 0;
  const TreeNode **nodes = malloc(capacity * sizeof(*nodes));
  if (!nodes) exit(1);
  nodes[0] = root;
  for (size_t i = 0; i < used; i++) {
    const TreeNode *node = nodes[i];
    if (node) {
      end = i + 1;
      if (used + 2 > capacity) {
        capacity *= 2;
        const TreeNode **larger = realloc(nodes, capacity * sizeof(*nodes));
        if (!larger) { free(nodes); exit(1); }
        nodes = larger;
      }
      nodes[used++] = node->left;
      nodes[used++] = node->right;
    }
  }
  putchar('[');
  for (size_t i = 0; i < end; i++) {
    if (i) putchar(',');
    if (nodes[i]) printf("%d", nodes[i]->val);
    else fputs("null", stdout);
  }
  putchar(']');
  free(nodes);
}`,
  },
};
