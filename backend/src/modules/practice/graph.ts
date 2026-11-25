import { z } from 'zod';

const graphLimit = 1000;
export const graphInput = z.array(z.array(z.number().int().positive())).max(graphLimit).superRefine((rows, ctx) => {
  if (rows.some((row) => row.some((neighbor) => neighbor > rows.length))) {
    ctx.addIssue({ code: 'custom', message: 'Graph neighbors must refer to a supplied vertex.' });
    return;
  }
  if (!rows.length) return;
  const seen = new Set([1]);
  const pending = [1];
  for (let i = 0; i < pending.length; i++) {
    for (const neighbor of rows[pending[i]! - 1]!) {
      if (!seen.has(neighbor)) { seen.add(neighbor); pending.push(neighbor); }
    }
  }
  if (seen.size !== rows.length) ctx.addIssue({ code: 'custom', message: 'Every vertex must be reachable from vertex 1.' });
});

export function graphPrelude(language: 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'c') {
  if (language === 'javascript' || language === 'typescript') {
    const typed = language === 'typescript';
    return `class Node {
  ` + (typed ? 'val: number;\n  neighbors: Node[];\n  ' : '') + `constructor(val = 0, neighbors` + (typed ? ': Node[]' : '') + ` = []) {
    this.val = val;
    this.neighbors = neighbors;
  }
}
function _practice_graph(rows` + (typed ? ': number[][]' : '') + `) {
  const nodes = rows.map((_, i) => new Node(i + 1));
  rows.forEach((row, i) => { nodes[i].neighbors = row.map((id) => nodes[id - 1]); });
  return nodes[0] || null;
}
function _practice_graph_json(root` + (typed ? ': Node | null' : '') + `) {
  if (!root) return [];
  const seen` + (typed ? ': Array<Node | undefined>' : '') + ` = [];
  const pending = [root];
  seen[root.val] = root;
  for (let i = 0; i < pending.length; i++) {
    for (const neighbor of pending[i].neighbors) {
      const label = neighbor.val;
      if (label < 1 || label > ` + graphLimit + ` || Math.floor(label) !== label) throw new Error("Invalid graph label");
      if (seen[label] && seen[label] !== neighbor) throw new Error("Duplicate graph labels");
      if (!seen[label]) { seen[label] = neighbor; pending.push(neighbor); }
    }
  }
  const sorted = pending.sort((a, b) => a.val - b.val);
  if (sorted.some((node, i) => node.val !== i + 1)) throw new Error("Invalid graph labels");
  return sorted.map((node) => node.neighbors.map((neighbor` + (typed ? ': Node' : '') + `) => neighbor.val));
}
`;
  }
  return sources[language];
}

const sources = {
  python: `class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = [] if neighbors is None else neighbors

def _practice_graph(rows):
    nodes = [Node(i + 1) for i in range(len(rows))]
    for i, row in enumerate(rows):
        nodes[i].neighbors = [nodes[index - 1] for index in row]
    return nodes[0] if nodes else None

def _practice_graph_json(root):
    if root is None:
        return []
    pending, seen = [root], {root.val: root}
    for node in pending:
        for neighbor in node.neighbors:
            prior = seen.get(neighbor.val)
            if prior is not None and prior is not neighbor:
                raise ValueError("Duplicate graph labels")
            if prior is None:
                seen[neighbor.val] = neighbor
                pending.append(neighbor)
    ordered = sorted(pending, key=lambda node: node.val)
    if any(node.val != i + 1 for i, node in enumerate(ordered)):
        raise ValueError("Invalid graph labels")
    return [[neighbor.val for neighbor in node.neighbors] for node in ordered]
`,
  java: `class Node {
  public int val;
  public List<Node> neighbors;
  public Node() { this(0); }
  public Node(int val) { this(val, new ArrayList<>()); }
  public Node(int val, List<Node> neighbors) { this.val = val; this.neighbors = neighbors; }
}

class PracticeGraph {
  static Node build(int[][] rows) {
    if (rows.length == 0) return null;
    Node[] nodes = new Node[rows.length];
    for (int i = 0; i < rows.length; i++) nodes[i] = new Node(i + 1);
    for (int i = 0; i < rows.length; i++)
      for (int label : rows[i]) nodes[i].neighbors.add(nodes[label - 1]);
    return nodes[0];
  }
  static List<List<Integer>> values(Node root) {
    List<List<Integer>> rows = new ArrayList<>();
    if (root == null) return rows;
    Map<Integer, Node> seen = new TreeMap<>();
    List<Node> pending = new ArrayList<>();
    pending.add(root);
    seen.put(root.val, root);
    for (int i = 0; i < pending.size(); i++) {
      for (Node neighbor : pending.get(i).neighbors) {
        Node prior = seen.putIfAbsent(neighbor.val, neighbor);
        if (prior != null && prior != neighbor) throw new IllegalArgumentException("Duplicate graph labels");
        if (prior == null) pending.add(neighbor);
      }
    }
    for (Node node : seen.values()) {
      if (node.val != rows.size() + 1) throw new IllegalArgumentException("Invalid graph labels");
      List<Integer> row = new ArrayList<>();
      for (Node neighbor : node.neighbors) row.add(neighbor.val);
      rows.add(row);
    }
    return rows;
  }
}
`,
  cpp: `class Node {
public:
  int val;
  std::vector<Node*> neighbors;
  Node() : Node(0) {}
  Node(int val) : val(val) {}
  Node(int val, std::vector<Node*> neighbors) : val(val), neighbors(std::move(neighbors)) {}
};

namespace practice_graph {
  Node *build(const std::vector<std::vector<int>>& rows) {
    if (rows.empty()) return nullptr;
    std::vector<Node *> nodes;
    for (size_t i = 0; i < rows.size(); i++) nodes.push_back(new Node((int)i + 1));
    for (size_t i = 0; i < rows.size(); i++)
      for (int label : rows[i]) nodes[i]->neighbors.push_back(nodes[label - 1]);
    return nodes[0];
  }
  std::vector<std::vector<int>> values(Node *root) {
    if (!root) return {};
    std::map<int, Node*> seen{{root->val, root}};
    std::vector<Node*> pending{root};
    for (size_t i = 0; i < pending.size(); i++) {
      for (Node *node : pending[i]->neighbors) {
        auto entry = seen.emplace(node->val, node);
        if (!entry.second && entry.first->second != node) throw std::invalid_argument("Duplicate graph labels");
        if (entry.second) pending.push_back(node);
      }
    }
    std::vector<std::vector<int>> rows;
    for (const auto& entry : seen) {
      if (entry.first != static_cast<int>(rows.size() + 1)) throw std::invalid_argument("Invalid graph labels");
      std::vector<int> row;
      for (Node *neighbor : entry.second->neighbors) row.push_back(neighbor->val);
      rows.push_back(std::move(row));
    }
    return rows;
  }
}
`,
  c: `typedef struct Node { int val; int numNeighbors; struct Node **neighbors; } Node;

static Node *_practice_graph(int **rows, int size, int *widths) {
  if (!size) return NULL;
  Node *nodes = calloc(size, sizeof(*nodes));
  if (!nodes) exit(1);
  for (int i = 0; i < size; i++) {
    nodes[i].val = i + 1;
    nodes[i].numNeighbors = widths[i];
    if (widths[i]) {
      nodes[i].neighbors = malloc(widths[i] * sizeof(*nodes[i].neighbors));
      if (!nodes[i].neighbors) exit(1);
    }
    for (int j = 0; j < widths[i]; j++) nodes[i].neighbors[j] = &nodes[rows[i][j] - 1];
  }
  return nodes;
}

static void _practice_graph_json(Node *root) {
  if (!root) { fputs("[]", stdout); return; }
  Node *labels[` + (graphLimit + 1) + `] = {0};
  Node *pending[` + graphLimit + `];
  if (root->val < 1 || root->val > ` + graphLimit + `) exit(1);
  labels[root->val] = pending[0] = root;
  int count = 1;
  for (int i = 0; i < count; i++) {
    Node *node = pending[i];
    if (node->numNeighbors < 0 || (node->numNeighbors && !node->neighbors)) exit(1);
    for (int j = 0; j < node->numNeighbors; j++) {
      Node *neighbor = node->neighbors[j];
      if (!neighbor || neighbor->val < 1 || neighbor->val > ` + graphLimit + `) exit(1);
      if (labels[neighbor->val] && labels[neighbor->val] != neighbor) exit(1);
      if (!labels[neighbor->val]) {
        labels[neighbor->val] = neighbor;
        pending[count++] = neighbor;
      }
    }
  }
  putchar('[');
  for (int i = 1; i <= count; i++) {
    Node *node = labels[i];
    if (!node) exit(1);
    if (i > 1) putchar(',');
    putchar('[');
    for (int j = 0; j < node->numNeighbors; j++) {
      if (j) putchar(',');
      printf("%d", node->neighbors[j]->val);
    }
    putchar(']');
  }
  putchar(']');
}
`,
};
