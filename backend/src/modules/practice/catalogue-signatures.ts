import type { ProblemSpec } from './problem-spec.js';
import { fixtureShapes, type FixtureKind } from './fixture-drivers.js';
import type { PracticeLanguage } from './contracts.js';

type Signature = NonNullable<ProblemSpec['nativeSignature']>;
type ValueType = Signature['args'][number];
type Design = NonNullable<ProblemSpec['designContract']>;
type Declaration = { args: string[]; returns: string };

const aliases: Record<string, ValueType | 'void'> = {
  int: 'int', Integer: 'int', int32_t: 'int', uint32_t: 'uint32',
  long: 'long', longlong: 'long', int64_t: 'long', Long: 'long',
  double: 'double', Double: 'double', float: 'double',
  boolean: 'bool', Boolean: 'bool', bool: 'bool',
  char: 'char', Character: 'char',
  string: 'string', String: 'string',
  TreeNode: 'TreeNode', 'TreeNode*': 'TreeNode', ListNode: 'ListNode', 'ListNode*': 'ListNode', Node: 'GraphNode', 'Node*': 'GraphNode',
  void: 'void',
};
const arrayTypes = new Set<ValueType>(['int[]', 'int[][]', 'char[]', 'char[][]', 'string[]', 'string[][]']);

function simplify(value: string) {
  return value.replace(/\b(?:public|private|protected|final|explicit|inline|static|virtual|const|struct)\b/g, '')
    .replace(/(?:std|java\.util)::/g, '').replace(/java\.util\./g, '').replace(/[\s&]/g, '');
}

function typeName(value: string): ValueType | 'void' | undefined {
  const clean = simplify(value);
  const generic = /^(?:vector|List|ArrayList)<(.+)>$/.exec(clean);
  const inner = generic?.[1] ?? (clean.endsWith('[]') ? clean.slice(0, -2) : undefined);
  if (inner) {
    const element = typeName(inner);
    const result = (element + '[]') as ValueType;
    return arrayTypes.has(result) || result === 'ListNode[]' ? result : undefined;
  }
  return aliases[clean];
}

function argTypes(text: string) {
  if (!text.trim() || text.trim() === 'void') return [];
  return text.split(',').map((arg) => arg.trim().replace(/([A-Za-z_$]\w*)\s*(\[\])?$/, (_match, _name, array) => array ?? '').trim());
}

function escaped(name: string) { return name.replaceAll('$', '\\$'); }
function withoutComments(code: string) { return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

function method(code: string | undefined, name: string): Declaration | undefined {
  if (!code) return;
  const expression = new RegExp('(?:^|[{};\\n])\\s*([\\w:<>,.*&\\[\\] \\t]+?)\\s*\\b' + escaped(name) + '\\s*\\(([^()\\n]*)\\)\\s*(?:const\\s*)?\\{');
  const match = expression.exec(withoutComments(code));
  return match?.[1] && match[2] !== undefined ? { returns: match[1].trim(), args: argTypes(match[2]) } : undefined;
}

function constructorArgs(code: string | undefined, name: string): string[] | undefined {
  if (!code) return;
  const expression = new RegExp('(?:^|[{};\\n])\\s*(?:(?:public|private|protected|explicit)\\s+)?' + escaped(name) + '\\s*\\(([^()\\n]*)\\)');
  const match = expression.exec(withoutComments(code));
  return match?.[1] === undefined ? undefined : argTypes(match[1]);
}

function convert(decl: Declaration | undefined, override?: string) {
  const returns = typeName(override || decl?.returns || '');
  if (!decl || !returns || returns === 'ListNode[]') return;
  const args = decl.args.map(typeName);
  if (args.some((arg) => !arg || arg === 'void')) return;
  return { returns, args: args as ValueType[] };
}

function pyClass(code?: string) {
  return code?.match(/^\s*class\s+([A-Za-z_]\w*)\b/m)?.[1];
}

const referenceFixtures: Record<string, { kind: FixtureKind; parameters: string[] }> = {
  firstBadVersion: { kind: 'versionBoundary', parameters: ['n', 'bad'] },
  hasCycle: { kind: 'linkedCycle', parameters: ['head', 'pos'] },
  getIntersectionNode: { kind: 'sharedListTail', parameters: ['listA', 'listB', 'intersectVal', 'skipA', 'skipB'] },
};

export function inferSignature(fn: string, starters: ProblemSpec['starters'], order: string[],
  cases: ProblemSpec['visible'], declared: Record<string, string>): Signature | undefined {
  const fixture = Object.hasOwn(referenceFixtures, fn) ? referenceFixtures[fn] : undefined;
  if (fixture && fixture.parameters.length === order.length && fixture.parameters.every((name, i) => name === order[i])) {
    const shape = fixtureShapes[fixture.kind];
    return { args: [...shape.args], returns: shape.returns, fixture: fixture.kind, pythonClass: pyClass(starters.python) };
  }
  for (const language of ['cpp', 'java'] as const) {
    const entry = convert(method(starters[language], fn), declared[language]);
    if (!entry || entry.args.length !== order.length) continue;
    const { args, returns } = entry;
    const result: Signature = { args: [...args], returns, pythonClass: pyClass(starters.python) };
    if (fn === 'serialize' && returns === 'string' && args.length === 1 && args[0] === 'TreeNode' &&
        typeName(method(starters[language], 'deserialize')?.returns ?? '') === 'TreeNode') {
      return { args: ['TreeNode'], returns: 'TreeNode', treeCodec: { deserialize: 'deserialize', className: 'Codec' } };
    }
    const roots = args.flatMap((type, i) => type === 'TreeNode' && cases.every((test) => Array.isArray(test.input[order[i]!])) ? [i] : []);
    const refs = args.flatMap((type, i) => type === 'TreeNode' && cases.every((test) => typeof test.input[order[i]!] === 'number') ? [i] : []);
    if (refs.length) {
      if (roots.length !== 1) continue;
      result.treeReferences = refs.map((argument) => ({ argument, root: roots[0]! }));
      refs.forEach((i) => { result.args[i] = 'int'; });
    }
    if (returns === 'TreeNode' && cases.every((test) => typeof test.expected === 'number')) result.treeResult = 'value';
    if (returns === 'void') {
      const mutable = args.flatMap((type, i) => arrayTypes.has(type) || type === 'TreeNode' || type === 'ListNode' ? [i] : []);
      if (mutable.length !== 1) continue;
      result.outputArgument = mutable[0];
    }
    return result;
  }
  return undefined;
}

export function inferDesign(className: string, resultMode: Design['resultMode'], starters: ProblemSpec['starters'],
  methods: string[], constructorCount: number): Design {
  for (const language of ['cpp', 'java'] as const) {
    const source = starters[language];
    if (!source) continue;
    const ctor = (constructorArgs(source, className) ?? []).map(typeName);
    if (ctor.length !== constructorCount || ctor.some((arg) => !arg || arg === 'void')) continue;
    const signatures = methods.map((name) => [name, convert(method(source, name))] as const);
    if (signatures.every((item) => item[1] !== undefined)) {
      return {
        className, resultMode, signatures: {
          constructorArgs: ctor as ValueType[],
          methods: Object.fromEntries(signatures) as NonNullable<Design['signatures']>['methods'],
        },
      };
    }
  }
  return { className, resultMode };
}

const cTypes: Partial<Record<ValueType, string>> = {
  TreeNode: 'TreeNode*', ListNode: 'ListNode*', GraphNode: 'Node*', string: 'char*', uint32: 'uint32_t', long: 'longlong',
};
function cArgument(type: ValueType): string[] {
  if (type === 'ListNode[]') return ['ListNode**', 'int'];
  if (arrayTypes.has(type)) {
    const item = type.startsWith('int') ? 'int' : 'char*';
    return type.endsWith('[][]') ? [item + '**', 'int', 'int*'] : [item + '*', 'int'];
  }
  return [cTypes[type] ?? type];
}

function cShape(signature: Pick<Signature, 'args' | 'returns'>, decl: Declaration | undefined, prepend?: string) {
  if (!decl) return false;
  const { args, returns } = signature;
  const expected = [...(prepend ? [prepend] : []), ...args.flatMap(cArgument)];
  let result: string = returns;
  if (returns !== 'void' && arrayTypes.has(returns)) {
    const item = returns.startsWith('int') ? 'int' : 'char*';
    const matrix = returns.endsWith('[][]');
    result = item + (matrix ? '**' : '*');
    expected.push('int*');
    if (matrix) expected.push('int**');
  } else if (returns !== 'void') result = cTypes[returns] ?? returns;
  return simplify(decl.returns) === result && expected.length === decl.args.length &&
    expected.every((type, i) => type === simplify(decl.args[i]!));
}

function nativeShape(language: 'java' | 'cpp' | 'c', code: string, name: string, signature: Pick<Signature, 'args' | 'returns'>,
  declarationOverride?: string, instance?: string) {
  const declared = method(code, name);
  if (language === 'c') return cShape(signature, declared, instance);
  const canonical = convert(declared, declarationOverride);
  const matches = (actual: string, expected: string) => actual === expected ||
    (language === 'java' && actual === 'int' && expected === 'uint32');
  return Boolean(canonical && matches(canonical.returns, signature.returns) && canonical.args.length === signature.args.length &&
    canonical.args.every((value, i) => matches(value, signature.args[i]!)));
}

export function matchingStarter(language: PracticeLanguage, code: string, fn: string, signature: Signature | undefined, design: Design | undefined,
  declaredReturns: Record<string, string>) {
  if (language === 'javascript' || language === 'typescript' || language === 'python') {
    const entry = design?.className ?? (signature?.fixture === 'versionBoundary' && language !== 'python' ? 'solution' : fn);
    const escapedEntry = escaped(entry);
    return new RegExp('(?:\\b(?:def|function|class)\\s+' + escapedEntry + '\\b|\\b' + escapedEntry + '\\s*=)').test(withoutComments(code));
  }
  if (design) {
    const typed = design.signatures;
    if (!typed) return false;
    if (language === 'c') {
      const ctor = method(code, design.className + '_create');
      const expected = typed.constructorArgs.flatMap(cArgument);
      if (!ctor || simplify(ctor.returns) !== design.className + '*' || ctor.args.length !== expected.length ||
        !expected.every((type, i) => simplify(ctor.args[i]!) === type)) return false;
      return Object.entries(typed.methods).every(([name, sig]) =>
        nativeShape(language, code, design.className + '_' + name, sig, undefined, design.className + '*'));
    }
    const ctor = (constructorArgs(code, design.className) ?? []).map(typeName);
    return ctor.length === typed.constructorArgs.length && ctor.every((type, i) => type === typed.constructorArgs[i]) &&
      Object.entries(typed.methods).every(([name, sig]) => nativeShape(language, code, name, sig));
  }
  if (!signature) return false;
  if (signature.treeCodec) {
    return nativeShape(language, code, fn, { args: ['TreeNode'], returns: 'string' }) &&
      nativeShape(language, code, signature.treeCodec.deserialize, { args: ['string'], returns: 'TreeNode' });
  }
  const args = signature.args.map((type, i) => signature.treeReferences?.some(({ argument }) => argument === i) ? 'TreeNode' as const : type);
  const passed = signature.fixture === 'sharedListTail' ? args.slice(0, 2) : signature.fixture ? args.slice(0, 1) : args;
  return nativeShape(language, code, fn, { ...signature, args: passed }, declaredReturns[language]);
}
