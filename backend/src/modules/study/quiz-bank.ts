/** Original CodeClub warm-up bank. IDs are versioned; persisted daily snapshots own review text. */
export type QuizQuestion = { id: string; topic: string; prompt: string; choices: string[]; answer: number; explanation: string };
const groups: Record<string, string> = {
  Arrays: `
Which index accesses the fourth item in a zero-based array?|0|2|3|4|2|Zero-based indices begin at 0, so the fourth item has index 3.
What happens to the length after appending one item to an array of length 5?|It stays 5|It becomes 6|It becomes 4|It becomes 10|1|Appending adds one item, increasing length by one.
What is the sum of the items in [2, 0, -3, 5]?|2|3|5|4|3|Adding the four values gives 4.
Which technique answers many static range-sum queries after linear preprocessing?|Prefix sums|Repeated sorting|Random sampling|Depth-first search|0|A range sum is the difference of two prefix sums.
What is the worst-case cost of inserting at the front of a contiguous dynamic array with n items?|O(1)|O(log n)|O(n)|O(n log n)|2|The existing items must be shifted to make space.
Which method can find a pair with a given sum in a sorted array in linear time?|Re-sort for every pair|Two pointers from opposite ends|Try every pair|Binary search each possible integer|1|Move the left or right pointer according to how the current sum compares with the target.
What is the maximum item in [-8, -2, -5]?|0|-8|-5|-2|3|The least negative value, -2, is the largest.
After reversing [4, 7, 1], which item is first?|1|4|7|0|0|Reversal places the previous final item first.`,
  Strings: `
How many characters are in the ASCII string "code"?|3|5|4|8|2|The string contains c, o, d and e.
Which string reads identically forward and backward?|planet|level|coding|array|1|Reversing level yields level.
Which operation joins two strings end to end?|Tokenization|Hashing|Sorting|Concatenation|3|Concatenation combines the complete strings in order.
Which data structure can count how often each letter appears?|Frequency table|Call stack only|Priority queue only|Linked-list tail only|0|A frequency table maps each letter to its count.
What is the longest common prefix of "flower" and "flight"?|f|flo|fl|flight|2|Both begin with fl and differ at their third character.
For a string of length n, how many start positions can a substring of length 1 have?|n + 1|n|1|n squared|1|Each of the n character positions begins one single-character substring.
Which check decides whether two lowercase ASCII words are anagrams?|Their first letters match|Their lengths differ|They have equal vowels|Their character counts match|3|Matching counts for every letter means the same multiset of characters.
What does the empty string contain?|Zero characters|One space|A null word|One newline|0|The empty string has length zero.`,
  Sorting: `
Which sorting algorithm repeatedly selects the smallest remaining item?|Merge sort|Quick sort|Selection sort|Binary search|2|Selection sort chooses the minimum from the unsorted suffix.
Which property preserves the order of items with equal keys?|In-place storage|Stability|Randomization|Descending order|1|A stable sort keeps equal-key items in their original relative order.
What is the sorted ascending order of [3, -1, 2]?|[3, 2, -1]|[2, -1, 3]|[-1, 3, 2]|[-1, 2, 3]|3|Ascending order runs from the smallest value to the largest.
Which algorithm merges sorted halves recursively?|Merge sort|Linear search|Breadth-first search|Selection search|0|Merge sort sorts each half and then merges them.
What is the worst-case comparison time of standard merge sort on n items?|O(n)|O(n squared)|O(n log n)|O(log n)|2|There are logarithmically many merge levels, each processing all n items.
Which input is best for insertion sort's usual implementation?|Reverse-sorted distinct items|Already sorted items|Random unique items only|All permutations tie|1|An already sorted array needs only one comparison per insertion.
Why can counting sort outperform comparison sorting on a small integer range?|It uses no memory|It always runs in constant time|It ignores duplicate keys|It counts values in the key range|3|Its running time is O(n + k) for n items and a key range of size k.
Which comparison describes descending numeric order?|Larger values come first|Smaller values come first|Only even values remain|Equal values disappear|0|Descending order places greater values before lesser values.`,
  Searching: `
What must hold for ordinary binary search on an array?|Length is a power of two|All values are positive|Values are sorted by the search order|There are no duplicates|2|Binary search discards halves using the sorted order.
Which algorithm checks items one at a time until a match is found?|Heap sort|Linear search|Merge sort|Topological sort|1|Linear search scans sequentially.
After a failed comparison in binary search, roughly what fraction remains?|All items|One item always|Three quarters|One half|3|Each step discards approximately half of the search interval.
What is the worst-case comparison count of linear search over n items?|n|1|log n|n squared|0|An absent value can require inspecting every item.
Which index does a lower-bound search seek in sorted data?|Last smaller value|Any equal value only|First value at least the target|Always the midpoint|2|Lower bound returns the earliest position whose value is not less than the target.
For sorted [1, 4, 7, 9], which half can contain 9 after checking 4?|Left half|Right half|Both halves are required|Neither half|1|All values to the left of 4 are too small.
Which midpoint expression avoids adding two potentially huge indices?|left + right|left times right|right minus left|left + floor((right - left) / 2)|3|Computing the offset before adding avoids overflow in left + right.
When searching an empty array, what should a normal search report?|No match|First element|Last element|The target itself|0|An empty array contains no candidate element.`,
  'Time complexity': `
How does a single loop over n items usually scale?|O(1)|O(log n)|O(n)|O(n cubed)|2|One constant-work iteration per item gives linear time.
Two nested loops each independently run n times. Their total iterations are approximately what?|n|n squared|2|log n|1|Each of n outer iterations performs n inner iterations.
Which growth rate is smallest for sufficiently large n?|n squared|n log n|n|log n|3|Logarithmic growth is slower than the listed linear and superlinear rates.
Which term dominates 3n squared + 10n + 7 as n grows?|n squared|n|7|10n|0|The highest-order term dominates asymptotic growth.
A loop doubles its counter from 1 until it reaches n. Its iteration count is what?|O(n)|O(n squared)|O(log n)|O(n log n)|2|Doubling reaches n after about log base 2 of n steps.
What does O(1) extra space mean?|No variables at all|Memory bounded independently of input size|Exactly one byte|Memory proportional to n|1|The amount of auxiliary storage stays bounded as input grows.
What is the time to visit every cell of an r by c matrix?|O(r + c)|O(r)|O(c)|O(r times c)|3|There are r times c cells.
Which notation expresses an asymptotic tight bound?|Theta|Only big O|Only big Omega|Modulo|0|Theta combines asymptotic upper and lower bounds.`,
  'Linked lists': `
What does a singly linked-list node normally store besides its value?|Array capacity|A tree root|A reference to the next node|A graph distance|2|The next reference connects the node to its successor.
What is the usual final next reference in an acyclic list?|The head always|Null|The middle node|An arbitrary node|1|A null next reference marks the end.
Given a head pointer, what is random access to the kth node usually?|O(1)|O(log k)|O(k log k)|O(k)|3|You follow successive next references to reach that node.
Which pair of pointers can detect a cycle using constant extra space?|Slow and fast pointers|Two head copies with equal speed|Two tail pointers|Two random pointers|0|Different speeds cause the pointers to meet inside a cycle.
After inserting a new node at the head, where should it point?|To itself|To null always|To the previous head|To the previous tail only|2|The old list must follow the new head.
What extra link does a doubly linked node normally have?|A root pointer|A previous-node reference|An array index only|A hash seed|1|The previous link supports backward traversal.
Which case should deleting the only node handle?|Adding a cycle|Keeping its old address as head|Creating two heads|Setting the head to null|3|Removing the sole node leaves an empty list.
Why can insertion after a known node take O(1) time?|Only a fixed number of links change|The entire list is copied|All values are sorted|The node values are hashed|0|No traversal is necessary when the insertion point is already known.`,
  Stacks: `
Which removal order defines a stack?|First in, first out|Sorted minimum first|Last in, first out|Random order|2|The most recently pushed item is removed first.
Which operation adds to a stack?|Pop|Push|Dequeue|Poll minimum|1|Push places an item at the top.
After push(2), push(5), pop(), what remains at the top?|5|7|Nothing|2|3|Pop removes 5, leaving 2 on top.
Which stack operation reads the top without removing it?|Peek|Push|Pop|Clear|0|Peek observes the current top item.
Which structure naturally validates nested parentheses?|FIFO queue|Unsorted set only|Stack|Adjacency matrix|2|A closing parenthesis must match the most recent unmatched opener.
What condition is stack underflow?|A full stack|Removing from an empty stack|Adding a duplicate|Peeking at a nonempty stack|1|There is no item available to remove.
A recursive function's suspended calls are commonly tracked using what?|A priority queue|A hash set|A circular array only|A call stack|3|Calls return in reverse order of invocation.
Which approach reverses a sequence using a stack?|Push each item, then pop all items|Pop before pushing anything|Sort by value|Remove alternate items|0|Last-in first-out retrieval reverses the original order.`,
  Queues: `
Which order defines an ordinary queue?|Largest first|Last in, first out|First in, first out|Random order|2|The earliest enqueued item is removed first.
Which operation adds an item to a queue?|Pop|Enqueue|Reverse|Peek|1|Enqueue appends at the rear.
After enqueue(8), enqueue(3), dequeue(), which value was removed?|3|11|Neither|8|3|The first enqueued value leaves first.
Which graph traversal normally uses a queue?|Breadth-first search|Recursive depth-first search only|Heap sort|Binary search|0|BFS processes vertices in discovery order.
Which end does dequeue remove from?|Rear|Middle|Front|Any position|2|An ordinary queue removes the front item.
What permits both front and rear insertion and removal?|A stack only|A deque|A binary search tree only|A string literal|1|A double-ended queue supports operations at both ends.
Why use a circular buffer for a bounded queue?|To sort every insertion|To prohibit wraparound|To copy all items per removal|To reuse freed array positions|3|Indices wrap around so vacated slots can be used again.
What does peeking at the front normally do?|Read without removing|Remove all items|Add an item|Swap both ends|0|Peek leaves the queue unchanged.`,
  Trees: `
How many children can one node have in a binary tree?|Exactly one|Exactly two|At most two|Any number|2|Binary means each node has no more than two child positions.
Which node has no parent in a rooted tree?|Leaf|Root|Sibling|Internal node always|1|The root starts the parent-child hierarchy.
Which traversal visits left subtree, node, then right subtree?|Preorder|Postorder|Level order|Inorder|3|Inorder places the current node between its left and right subtrees.
A leaf node has how many children?|Zero|One|Two|Three|0|A leaf has no child nodes.
In a strict binary search tree, left-subtree keys are what relative to the node?|All greater|Unrestricted|All smaller|All equal|2|The strict BST ordering places smaller keys on the left.
A tree with n nodes has how many edges when n is positive?|n|n - 1|n + 1|2n|1|A connected acyclic graph on n nodes has n minus one edges.
Which traversal processes a tree one depth at a time?|Inorder|Postorder|Preorder|Level order|3|Level order visits all nodes of one depth before the next.
What can happen to a plain BST after inserting increasing distinct keys?|It becomes a chain|It must stay balanced|It becomes a cycle|Its root disappears|0|Each new key may attach to the rightmost node, producing linear height.`,
  Graphs: `
What does an edge connect in a graph?|Two arrays only|Two colors only|Vertices|Complexities|2|Edges represent connections between vertices.
Which representation is often space-efficient for a sparse graph?|A full adjacency matrix|An adjacency list|A table of all possible pairs|Every permutation|1|Adjacency lists store actual neighbors rather than every possible edge.
Which traversal finds shortest paths by edge count in an unweighted graph?|Arbitrary DFS|Selection sort|Binary search|Breadth-first search|3|BFS discovers vertices in increasing distance from the start.
What distinguishes a directed edge?|It has an orientation|It always has weight 1|It must be part of a cycle|It connects three vertices|0|A directed edge has a source and a destination.
Why track visited vertices during traversal?|To sort labels|To remove all edges|To avoid repeated processing and cycles|To make the graph complete|2|Marking discovered vertices prevents repeated exploration.
What is a connected component in an undirected graph?|A single edge only|A maximal set of mutually reachable vertices|Every vertex with even degree|A list of weights|1|A component contains all vertices reachable from any vertex in that component.
A topological ordering exists exactly for which directed graphs?|All directed graphs|Only complete graphs|Only cyclic graphs|Directed acyclic graphs|3|A directed cycle prevents any valid prerequisite order.
Which shortest-path algorithm requires nonnegative edge weights in its usual form?|Dijkstra's algorithm|Insertion sort|Tree inorder traversal|Floyd's cycle detection|0|Dijkstra's settled-distance argument depends on nonnegative weights.`,
  'Dynamic programming': `
What does memoization save?|Only source code|Every possible permutation|Previously computed subproblem results|Unused variables|2|Cached results avoid recomputing identical subproblems.
Which feature makes DP especially useful?|All subproblems are unrelated|Overlapping subproblems|No repeated states ever|Only one constant operation|1|Repeated states can reuse stored answers.
Which term means building a DP table from smaller states upward?|Memoized recursion only|Random search|Backtracking only|Tabulation|3|Tabulation computes states in dependency order.
Why is a base case necessary?|It anchors the recurrence with known results|It sorts the input automatically|It eliminates all memory|It changes the problem definition|0|Transitions ultimately depend on initialized states.
For F(0)=0, F(1)=1 and F(n)=F(n-1)+F(n-2), what is F(4)?|2|4|3|5|2|The sequence begins 0, 1, 1, 2, 3.
When can a one-dimensional DP often use rolling storage?|All previous states are always needed|Only a fixed number of recent states are needed|States contain arbitrary graphs|Transitions have no dependencies|1|Old states can be discarded after their final use.
What should a DP state describe?|An arbitrary variable name|Only the final answer|The compiler version|A precisely defined subproblem|3|A clear state definition gives meaning to each stored value.
What does optimal substructure allow?|Combining optimal subproblem results into an optimal solution|Ignoring all constraints|Choosing greedily in every problem|Avoiding base cases|0|An optimal solution can be decomposed into compatible optimal subsolutions.`,
  DBMS: `
What identifies each row uniquely in a relational table?|A duplicate label|A comment|A primary key|An unordered note|2|A primary key uniquely identifies a row and cannot be null.
Which SQL clause filters rows before grouping?|ORDER BY|WHERE|HAVING only|LIMIT only|1|WHERE filters individual input rows before GROUP BY.
Which SQL operation combines related rows from tables?|DROP|TRUNCATE|RENAME|JOIN|3|JOIN relates table rows using the specified matching rule.
What does the atomicity property of a transaction mean?|All its changes succeed together or are rolled back|Every query runs instantly|Every table has one row|Rows are alphabetically ordered|0|Atomicity prevents partial transaction effects.
Which constraint expresses a reference to another table's key?|A comment|A sort order|A foreign key|A view name|2|Foreign keys enforce referential integrity.
What can an index often improve?|Every possible write|Finding matching rows|The meaning of null|The precision of all numbers|1|An index can reduce the work needed to locate selected rows.
Which aggregate counts all result rows, including rows with null columns?|SUM(*)|AVG(*)|MIN(*)|COUNT(*)|3|COUNT(*) counts rows without testing a particular column for null.
What does normalization primarily aim to reduce?|Redundant data and update anomalies|The number of users|All joins unconditionally|Every column's length|0|Organizing dependencies reduces repeated facts and inconsistent updates.`,
  'Operating systems': `
What is a process?|Only a source file|A keyboard device|A running program instance|A network address|2|A process holds execution state and resources for a program.
Which scheduler action lets another ready process use the CPU?|Compaction|Context switching|File renaming|Formatting|1|A context switch saves one execution state and restores another.
What is a race condition?|A sorted queue|A successful backup|A fixed program output|A result depending on uncontrolled concurrent timing|3|Unsynchronized interleavings can change the result.
What does a mutex provide?|Mutual exclusion for a critical section|Unlimited CPU cores|Permanent storage|Network encryption|0|A mutex allows one holder at a time.
Which event occurs when a needed virtual-memory page is absent from RAM?|Cache hit always|Normal function return|Page fault|Successful file close|2|The OS must resolve the missing page mapping or load the page.
What is deadlock?|Every process finishes|Participants wait indefinitely for resources held by one another|Memory is always empty|A CPU has no instructions|1|Circular resource dependencies can prevent all involved participants from proceeding.
Threads in one process commonly share what?|Separate physical machines|Independent file systems always|No resources|The process address space|3|Threads share process memory while keeping their own execution stacks and registers.
Which term describes the CPU rapidly sharing execution among tasks?|Time slicing|Disk partitioning|File compression|Static linking|0|Each runnable task receives a bounded interval before the scheduler may switch.`,
  JavaScript: `
Which declaration creates a block-scoped reassignable binding?|var only|const only|let|function only|2|let is block-scoped and permits reassignment.
What does strict equality (===) avoid?|Comparing numbers|Implicit type coercion|Comparing strings|Boolean results|1|Strict equality compares without converting operands to a common type.
What does Array.prototype.map return?|The first item only|A sorted original array always|A boolean only|A new array of transformed items|3|map creates an output item for each input item.
Which value represents an explicitly assigned empty reference?|null|0|false|An empty array|0|null is a distinct primitive used for deliberate absence.
What does await do inside an async function?|Block every thread permanently|Start a new OS process|Suspend that function until the awaited promise settles|Convert all errors to strings|2|The async function pauses while the surrounding event loop can continue.
Which structure stores unique values?|Array only|Set|String only|Promise|1|A Set stores each distinct value once.
What is a closure?|An HTML closing tag|A loop that never ends|A compiled binary|A function retaining access to its lexical environment|3|A closure can use variables from the scope where the function was created.
Which statement about const is correct?|It prevents rebinding but does not freeze an object|It makes every object immutable|It is function-scoped only|It requires a number|0|Properties of a const-bound object can still change unless separately protected.`,
  Python: `
Which built-in sequence type is immutable?|list|dict|tuple|set|2|A tuple's element references cannot be reassigned after creation.
What does len([4, 4, 9]) return?|2|3|9|17|1|len counts items, including duplicates.
What does 7 // 2 evaluate to in Python?|3.5|4|1|3|3|Floor division of these positive integers gives 3.
Which structure maps keys to values?|dict|tuple only|range only|str only|0|A dictionary associates hashable keys with values.
Which keyword starts a function definition?|function|func|def|lambda only|2|A named function definition begins with def.
What does list(range(3)) produce?|[1, 2, 3]|[0, 1, 2]|[0, 1, 2, 3]|[3]|1|range(3) starts at zero and stops before three.
What does a list slice values[1:3] include?|Indices 0 through 3|Only index 3|Indices 1 through 3|Indices 1 and 2|3|The start is inclusive and the stop is exclusive.
How do you test whether x is None using the usual identity check?|x is None|x = None|x equals None|None(x)|0|is checks identity with Python's None singleton.`,
};
export const quizBank: readonly QuizQuestion[] = Object.entries(groups).flatMap(([topic, rows]) =>
  rows.trim().split('\n').map((line, index) => {
    const [prompt, a, b, c, d, answer, explanation] = line.split('|');
    if (!prompt || !a || !b || !c || !d || !explanation || !/^[0-3]$/.test(answer ?? '')) throw new Error('Invalid quiz bank entry.');
    return { id: 'original-v1-' + topic.toLowerCase().replaceAll(' ', '-') + '-' + (index + 1), topic,
      prompt, choices: [a, b, c, d], answer: Number(answer), explanation };
  }));
export const legacyQuizBank: readonly QuizQuestion[] = [
  { prompt: 'What is the time complexity of scanning an unsorted array once?', choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 2 },
  { prompt: 'Which operation removes the last item added to a stack?', choices: ['Peek', 'Pop', 'Push', 'Enqueue'], answer: 1 },
  { prompt: 'Which property makes binary search possible on an array?', choices: ['All items are distinct', 'It contains strings', 'It is sorted', 'Its length is even'], answer: 2 },
  { prompt: 'What is the identity value when counting matches?', choices: ['0', '1', '−1', 'The threshold'], answer: 0 },
].map((question, index) => ({ ...question, id: 'legacy-v0-' + index, topic: 'Practice basics',
  explanation: 'The correct answer is ' + question.choices[question.answer] + '.' }));
