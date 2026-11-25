import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { PracticeLanguage } from './contracts.js';
import { cArrayArgument, cArrayHelpers, cArrayPrint, cArrayReturn, isCArray } from './c-arrays.js';
import { boundaryPrelude, fixtureCallArguments, fixtureShapes, prepareFixture } from './fixture-drivers.js';
import { intValue, isNodeType, nodeInput, nodePrelude, type NodeType } from './structures.js';
import { weightedPlan, weightedSampleCount, weightedSampling, type WeightedPlan } from './weighted-sampling.js';

const identifier = z.string().regex(/^[A-Za-z_$][\w$]*$/).max(100);
const primitiveType = z.enum(['int', 'uint32', 'int[]', 'int[][]', 'long', 'double', 'bool', 'char', 'char[]', 'char[][]', 'string', 'string[]', 'string[][]']);
const valueType = z.union([primitiveType, z.enum(['ListNode', 'TreeNode', 'GraphNode'])]);
const argumentType = z.union([valueType, z.literal('ListNode[]')]);
const returnType = z.union([valueType, z.literal('void')]);
const argIndex = z.number().int().nonnegative().max(15);
const treeReference = z.object({ argument: argIndex, root: argIndex });
export const nativeSignature = z.object({
  args: z.array(argumentType).max(16),
  fixture: z.enum(['versionBoundary', 'linkedCycle', 'sharedListTail']).optional(),
  returns: returnType,
  outputArgument: argIndex.optional(),
  pythonClass: identifier.optional(),
  treeReferences: z.array(treeReference).max(15).optional(),
  treeResult: z.literal('value').optional(),
  treeCodec: z.object({ deserialize: identifier, className: identifier }).optional(),
}).superRefine(({ args, returns, outputArgument, treeReferences, treeResult, treeCodec, pythonClass, fixture }, ctx) => {
  if (returns === 'void' ? outputArgument === undefined || outputArgument >= args.length || args[outputArgument] === 'ListNode[]' : outputArgument !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['outputArgument'], message: 'Select the output argument for an in-place function.' });
  }
  if (fixture) {
    const shape = fixtureShapes[fixture];
    if (returns !== shape.returns || args.length !== shape.args.length || args.some((type, i) => type !== shape.args[i]) ||
      outputArgument !== undefined || treeReferences?.length || treeResult || treeCodec) {
      ctx.addIssue({ code: 'custom', path: ['fixture'], message: 'Fixture argument and return types do not match.' });
    }
  }
  if (treeReferences && (treeReferences.some(({ argument, root }) => args[argument] !== 'int' || args[root] !== 'TreeNode') ||
    new Set(treeReferences.map(({ argument }) => argument)).size !== treeReferences.length ||
    treeReferences.some(({ argument }) => argument === outputArgument))) {
    ctx.addIssue({ code: 'custom', path: ['treeReferences'], message: 'Each reference must link a distinct integer argument to a tree argument.' });
  }
  if (treeResult && returns !== 'TreeNode') {
    ctx.addIssue({ code: 'custom', path: ['treeResult'], message: 'A node value result requires a tree return type.' });
  }
  if (treeCodec && (args.length !== 1 || args[0] !== 'TreeNode' || returns !== 'TreeNode' || treeResult || treeReferences?.length || pythonClass)) {
    ctx.addIssue({ code: 'custom', path: ['treeCodec'], message: 'A codec uses one tree argument, a tree result, and its declared class.' });
  }
});
type NativeSignature = z.infer<typeof nativeSignature>;
type ValueType = z.infer<typeof argumentType>;
type Value = z.infer<ReturnType<typeof z.json>>;
const methodSignature = z.object({ args: z.array(argumentType).max(16), returns: returnType });
export const designContract = z.object({
  className: identifier,
  resultMode: z.enum(['all', 'returningOnly']),
  includeConstructor: z.boolean().optional(),
  signatures: z.object({ constructorArgs: z.array(argumentType).max(16), methods: z.record(identifier, methodSignature) }).optional(),
  weightedSampling: weightedSampling.optional(),
}).superRefine(({ signatures, weightedSampling: sampling }, ctx) => {
  if (!sampling) return;
  const method = signatures && Object.hasOwn(signatures.methods, sampling.method) ? signatures.methods[sampling.method] : undefined;
  if (!method || method.args.length !== 0 || method.returns !== 'int' || signatures?.constructorArgs[sampling.weightArgument] !== 'int[]') {
    ctx.addIssue({ code: 'custom', path: ['weightedSampling'], message: 'Select an integer array and a zero-argument integer draw method.' });
  }
});
const inputs = z.record(z.string(), z.json());
const commands = z.object({ operations: z.array(identifier).min(1).max(1000), arguments: z.array(z.array(z.json()).max(16)) });
const asciiChar = z.string().regex(/^[\u0001-\u007f]$/);
const validators = {
  int: intValue, uint32: z.number().int().min(0).max(0xffffffff), 'ListNode[]': z.array(nodeInput.ListNode), 'int[]': z.array(intValue), 'int[][]': z.array(z.array(intValue)),
  long: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  double: z.number(), bool: z.boolean(), char: asciiChar, 'char[]': z.array(asciiChar), 'char[][]': z.array(z.array(asciiChar)),
  string: z.string(), 'string[]': z.array(z.string()), 'string[][]': z.array(z.array(z.string())), ...nodeInput,
};

export type Suite = {
  functionName: string;
  parameterOrder: string[];
  comparisonMode: 'EXACT' | 'UNORDERED';
  nativeSignature?: unknown;
  designContract?: unknown;
};
type NativeLanguage = 'java' | 'cpp' | 'c';
type DynamicLanguage = Exclude<PracticeLanguage, NativeLanguage>;
type Argument = { type: ValueType; value: Value; treeRoot?: number };

function invalid(): never {
  throw new AppError(503, 'SUITE_INVALID', 'This problem has an invalid execution contract.');
}

function typedArguments(types: ValueType[], args: Value[], refs: NativeSignature['treeReferences'] = []): Argument[] {
  if (types.length !== args.length) invalid();
  const typed = types.map((type, i): Argument => {
    const value = args[i]!;
    if (!validators[type].safeParse(value).success) invalid();
    return { type, value };
  });
  for (const { argument, root } of refs) {
    const selected = typed[argument]!;
    const values = typed[root]!.value as Array<number | null>;
    if (values.indexOf(selected.value as number) === -1 || values.indexOf(selected.value as number) !== values.lastIndexOf(selected.value as number)) invalid();
    selected.treeRoot = root;
  }
  return typed;
}

function cppType(type: ValueType): string {
  if (isNodeType(type)) return (type === 'GraphNode' ? 'Node' : type) + '*';
  if (type === 'uint32') return 'uint32_t';
  if (type.endsWith('[]')) return 'std::vector<' + cppType(type.slice(0, -2) as ValueType) + '>';
  return type === 'string' ? 'std::string' : type === 'long' ? 'long long' : type;
}

function javaType(type: ValueType): string {
  if (type === 'GraphNode') return 'Node';
  return type.replace('uint32', 'int').replace('bool', 'boolean').replace('string', 'String');
}

function quotedNative(language: NativeLanguage, value: string) {
  const characters = language === 'java' ? value.split('').map((ch) => ch.charCodeAt(0)) : [...Buffer.from(value, 'utf8')];
  const quoted = characters.map((char) => {
    if (char === 34 || char === 92) return '\\' + String.fromCharCode(char);
    if (char < 32 || (language !== 'java' && char >= 127)) return '\\' + char.toString(8).padStart(3, '0');
    if (char >= 0xd800 && char <= 0xdfff) return '\\u' + char.toString(16);
    return String.fromCharCode(char);
  }).join('');
  return '"' + quoted + '"';
}

function numberLiteral(language: NativeLanguage, type: ValueType, value: Value) {
  const literal = JSON.stringify(value);
  if (type === 'uint32') return language === 'java' ? '(int)' + literal + 'L' : 'UINT32_C(' + literal + ')';
  if (type === 'long') return literal + (language === 'java' ? 'L' : 'LL');
  return type === 'double' && /^-?\d+$/.test(literal) ? literal + '.0' : literal;
}

function literal(language: 'java' | 'cpp', type: ValueType, value: Value): string {
  if (type === 'GraphNode') {
    return (language === 'java' ? 'PracticeGraph.build(' : 'practice_graph::build(') + literal(language, 'int[][]', value) + ')';
  }
  if (type === 'ListNode') {
    return (language === 'java' ? 'PracticeList.build(' : 'practice_nodes::list(') + literal(language, 'int[]', value) + ')';
  }
  if (type === 'TreeNode') {
    const values = (value as Array<number | null>).map((item) => item ?? (language === 'java' ? 'null' : '2147483648LL')).join(', ');
    return (language === 'java' ? 'PracticeTree.build(new Integer[] {' : 'practice_nodes::tree({') + values + '})';
  }
  if (type.endsWith('[]') && Array.isArray(value)) {
    const inner = type.slice(0, -2) as ValueType;
    const array = '{' + value.map((item) => literal(language, inner, item)).join(', ') + '}';
    return language === 'java' ? 'new ' + javaType(type) + array : cppType(type) + array;
  }
  if (type === 'string') {
    const quoted = quotedNative(language, value as string);
    return language === 'cpp' ? 'std::string(' + quoted + ', ' + Buffer.byteLength(value as string) + ')' : quoted;
  }
  if (type === 'char') return quotedNative(language, value as string) + (language === 'java' ? '.charAt(0)' : '[0]');
  return numberLiteral(language, type, value);
}

const findTreeNode = { java: 'PracticeTree.find', cpp: 'practice_nodes::find', c: '_practice_tree_find' } as const;

function nativeArguments(language: NativeLanguage, args: Argument[], prefix: string) {
  const declarations: string[] = [];
  const names = args.map((_, i) => prefix + i);
  const references: string[] = [];
  const pass = args.flatMap(({ type, value, treeRoot }, i) => {
    const name = names[i]!;
    if (treeRoot !== undefined) {
      references.push((language === 'java' ? 'TreeNode ' : 'TreeNode* ') + name + ' = ' +
        findTreeNode[language] + '(' + names[treeRoot] + ', ' + JSON.stringify(value) + ');');
      return [name];
    }
    if (language === 'java' || language === 'cpp') {
      declarations.push((language === 'java' ? javaType(type) : cppType(type)) + ' ' + name + ' = ' + literal(language, type, value) + ';');
      return [name];
    }
    if (isCArray(type)) {
      const array = cArrayArgument(type, value as Array<number | string> | Array<Array<number | string>>, name, (text) => quotedNative('c', text));
      declarations.push(...array.declarations);
      return array.pass;
    }
    if (type === 'GraphNode' || type === 'ListNode[]') {
      const rows = value as number[][];
      const { declarations: matrix, pass } = cArrayArgument('int[][]', rows, name + '_rows', (text) => quotedNative('c', text));
      declarations.push(...matrix);
      if (type === 'GraphNode') {
        declarations.push('Node* ' + name + ' = _practice_graph(' + pass.join(', ') + ');');
        return [name];
      }
      declarations.push('ListNode* ' + name + '[' + Math.max(1, rows.length) + '] = {0};');
      declarations.push('for (int i = 0; i < ' + rows.length + '; i++) ' + name + '[i] = _practice_list(' + pass[0] + '[i], ' + pass[2] + '[i]);');
      return [name, String(rows.length)];
    }
    if (isNodeType(type)) {
      const tree = type === 'TreeNode';
      const values = value as Array<number | null>;
      declarations.push((tree ? 'long long ' : 'int ') + name + '_values[] = {' + (values.map((item) => item ?? '2147483648LL').join(', ') || '0') + '};');
      declarations.push(type + '* ' + name + ' = ' + (tree ? '_practice_tree' : '_practice_list') + '(' + name + '_values, ' + values.length + ');');
      return [name];
    }
    declarations.push(type === 'string'
      ? 'char ' + name + '[] = ' + quotedNative('c', value as string) + ';'
      : cppType(type) + ' ' + name + ' = ' + (type === 'char' ? quotedNative('c', value as string) + '[0]' : numberLiteral('c', type, value)) + ';');
    return [name];
  });
  return { declarations: [...declarations, ...references], pass, names };
}

function nativeEmit(language: NativeLanguage, type: ValueType, expression: string) {
  if (type === 'GraphNode') {
    if (language === 'java') return 'emit(PracticeGraph.values(' + expression + '));';
    if (language === 'cpp') return 'practice_output::emit(practice_graph::values(' + expression + '));';
    return '_practice_graph_json(' + expression + ');';
  }
  if (type === 'uint32') {
    if (language === 'java') return 'emit(Integer.toUnsignedLong(' + expression + '));';
    if (language === 'cpp') return 'std::cout << static_cast<uint32_t>(' + expression + ');';
    return 'printf("%llu", (unsigned long long)(uint32_t)(' + expression + '));';
  }
  if (language === 'java') {
    if (isNodeType(type)) return 'System.out.print(Practice' + (type === 'ListNode' ? 'List' : 'Tree') + '.json(' + expression + '));';
    return 'emit(' + expression + ');';
  }
  if (language === 'cpp') return (isNodeType(type) ? 'practice_nodes' : 'practice_output') + '::emit(' + expression + ');';
  if (type === 'ListNode') return '_practice_list_json(' + expression + ');';
  if (type === 'TreeNode') return '_practice_tree_json(' + expression + ');';
  if (type === 'int') return 'printf("%d", ' + expression + ');';
  if (type === 'long') return 'printf("%lld", (long long)(' + expression + '));';
  if (type === 'double') return 'printf("%.17g", (double)(' + expression + '));';
  if (type === 'char') return '_practice_string((char[]){' + expression + ', 0});';
  if (type === 'bool') return 'fputs((' + expression + ') ? "true" : "false", stdout);';
  if (type === 'string') return '_practice_string(' + expression + ');';
  return invalid();
}

const javaOutput = `
  static void emit(Object v) {
    if (v == null) { System.out.print("null"); return; }
    if (v.getClass().isArray()) {
      System.out.print("[");
      for (int i = 0; i < java.lang.reflect.Array.getLength(v); i++) {
        if (i > 0) System.out.print(",");
        emit(java.lang.reflect.Array.get(v, i));
      }
      System.out.print("]");
    } else if (v instanceof Iterable<?>) {
      System.out.print("[");
      boolean first = true;
      for (Object item : (Iterable<?>)v) {
        if (!first) System.out.print(",");
        emit(item);
        first = false;
      }
      System.out.print("]");
    } else if (v instanceof String || v instanceof Character) {
      String text = v.toString();
      System.out.print('"');
      for (int i = 0; i < text.length(); i++) {
        char ch = text.charAt(i);
        if (ch == 34 || ch == 92) System.out.print((char)92);
        if (ch < 32 || Character.isSurrogate(ch)) System.out.printf("%c%c%04x", (char)92, 'u', (int)ch);
        else System.out.print(ch);
      }
      System.out.print('"');
    } else System.out.print(v);
  }`;

const cppOutput = `
namespace practice_output {
  void emit(int v) { std::cout << v; }
  void emit(long v) { std::cout << v; }
  void emit(long long v) { std::cout << v; }
  void emit(double v) {
    std::ostringstream text;
    text << std::setprecision(std::numeric_limits<double>::max_digits10) << v;
    std::cout << text.str();
  }
  void emit(bool v) { std::cout << (v ? "true" : "false"); }
  void emit(const std::string& v) {
    std::cout << char(34);
    for (unsigned char ch : v) {
      if (ch == 34 || ch == 92) std::cout << char(92);
      if (ch < 32) {
        char escape[7];
        std::snprintf(escape, sizeof(escape), "%c%c%04x", char(92), 'u', static_cast<unsigned int>(ch));
        std::cout << escape;
      } else std::cout << ch;
    }
    std::cout << char(34);
  }
  void emit(char v) { emit(std::string(1, v)); }
  template<class T> void emit(const std::vector<T>& v) {
    std::cout << '[';
    for (size_t i = 0; i < v.size(); i++) {
      if (i) std::cout << ',';
      emit(v[i]);
    }
    std::cout << ']';
  }
}`;

const cOutput = `
static void _practice_string(const char *value) {
  if (!value) { fputs("null", stdout); return; }
  putchar('"');
  for (const unsigned char *ch = (const unsigned char *)value; *ch; ch++) {
    if (*ch == 34 || *ch == 92) putchar(92);
    if (*ch < 32) printf("%c%c%04x", 92, 'u', (unsigned int)*ch);
    else putchar(*ch);
  }
  putchar('"');
}`;

function nodeTypes(types: Iterable<string>) {
  return new Set([...types].map((type) => type === 'ListNode[]' ? 'ListNode' : type).filter(isNodeType));
}

function nativeProgram(language: NativeLanguage, code: string, className: string, body: string[], nodes: Set<NodeType>, fixture = '') {
  const prelude = nodePrelude(language, nodes) + '\n' + fixture;
  const statements = body.join('\n    ');
  if (language === 'java') {
    const publicClass = new RegExp('\\bpublic\\s+class\\s+' + className.replaceAll('$', '\\$') + '(?=\\s|\\{)');
    return 'import java.util.*;\n' + code.replace(publicClass, 'class ' + className) + '\n' + prelude +
      '\npublic class Main {\n' + javaOutput + '\n  public static void main(String[] args) {\n    ' + statements + '\n    System.out.println();\n  }\n}\n';
  }
  const cpp = language === 'cpp';
  const includes = cpp ? '#include <bits/stdc++.h>\nusing namespace std;' : '#include <stdbool.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>';
  return includes + '\n' + prelude + '\n' + (cpp ? cppOutput : cOutput + '\n' + cArrayHelpers) + '\n' + code + '\nint main(' + (cpp ? '' : 'void') +
    ') {\n    ' + statements + '\n    ' + (cpp ? 'std::cout << char(10);' : 'putchar(10);') + '\n    return 0;\n}\n';
}

const dynamicHelper = (type: NodeType) => ({
  ListNode: '_practice_list', TreeNode: '_practice_tree', GraphNode: '_practice_graph',
})[type];

function dynamicInput(language: DynamicLanguage, type: ValueType | undefined, literal: string) {
  if (type === 'ListNode[]') return language === 'python'
    ? '[_practice_list(row) for row in ' + literal + ']' : literal + '.map(_practice_list)';
  return type && isNodeType(type) ? dynamicHelper(type) + '(' + literal + ')' : literal;
}

function dynamicFunction(language: DynamicLanguage, code: string, fn: string, args: Value[], signature?: NativeSignature, typed: Argument[] = [], boundary?: number) {
  const output = signature?.outputArgument;
  const returns = output === undefined ? signature?.returns : typed[output]!.type;
  const nodes = nodeTypes([...(signature?.args ?? []), returns ?? '']);
  const python = language === 'python';
  if (!python && !nodes.size && output === undefined && !signature?.fixture) {
    return code + '\n;console.log(JSON.stringify(' + fn + '(' + args.map((value) => JSON.stringify(value)).join(', ') + ')));\n';
  }
  const lines: string[] = [];
  const references: string[] = [];
  if (python) lines.push('_practice_args = _practice_json.loads(' + JSON.stringify(JSON.stringify(args)) + ')');
  const names = args.map((_, i) => '_practice_arg_' + i);
  args.forEach((value, i) => {
    const literal = python ? '_practice_args[' + i + ']' : JSON.stringify(value);
    const argument = typed[i];
    const root = argument?.treeRoot;
    const valueSource = root !== undefined ? '_practice_tree_find(' + names[root] + ', ' + literal + ')' + (language === 'typescript' ? '!' : '')
      : dynamicInput(language, argument?.type, literal);
    const declaration = (python ? '' : 'const ') + names[i] + ' = ' + valueSource + (python ? '' : ';');
    (root === undefined ? lines : references).push(declaration);
  });
  lines.push(...references);
  const className = python ? signature?.treeCodec?.className ?? signature?.pythonClass : undefined;
  if (className) lines.push('_practice_solution = ' + className + '()');
  const target = className ? '_practice_solution.' : '';
  const codec = signature?.treeCodec;
  const pass = fixtureCallArguments(language, signature?.fixture, names);
  const call = !python && boundary !== undefined
    ? 'solution((version' + (language === 'typescript' ? ': number' : '') + ') => version >= ' + boundary + ')(' + pass.join(', ') + ')'
    : target + fn + '(' + pass.join(', ') + ')';
  if (output !== undefined) lines.push(call + (python ? '' : ';'));
  const result = output !== undefined ? names[output]! : codec ? target + codec.deserialize + '(' + call + ')' : call;
  const converted = signature?.treeResult
    ? '_practice_tree_value(' + result + ')'
    : signature?.fixture === 'sharedListTail' ? '_practice_list_value(' + result + ')'
    : returns && isNodeType(returns) ? dynamicHelper(returns) + '_json(' + result + ')' : result;
  if (python) {
    return (nodes.size ? 'from __future__ import annotations\n' : '') + code + '\nimport json as _practice_json\n' +
      nodePrelude(language, nodes) + '\n' + (boundary === undefined ? '' : boundaryPrelude(language, boundary)) + lines.join('\n') + '\nprint(_practice_json.dumps(' + converted + '))\n';
  }
  return code + '\n;' + nodePrelude(language, nodes) + '\n{\n' + lines.join('\n') +
    '\nconsole.log(JSON.stringify(' + converted + '));\n}\n' + (language === 'typescript' && nodes.has('GraphNode') ? 'export {};\n' : '');
}

function nativeFunction(language: NativeLanguage, code: string, fn: string, args: Argument[], signature: NativeSignature, boundary?: number) {
  const { returns, outputArgument: output, treeCodec, treeResult } = signature;
  const { declarations, pass, names } = nativeArguments(language, args, '_practice_arg_');
  const className = treeCodec?.className ?? 'Solution';
  if (language === 'java') declarations.push(className + ' solution = new ' + className + '();');
  if (language === 'cpp') declarations.push(className + ' solution;');
  const target = language !== 'c' ? 'solution.' : '';
  const fixturePass = fixtureCallArguments(language, signature.fixture, pass);
  const call = target + fn + '(' + fixturePass.join(', ') + ')';
  const resultType = returns === 'void' ? args[output!]!.type : returns;
  if (treeCodec) {
    if (language === 'c') {
      declarations.push('char *_practice_encoded = ' + call + ';');
      declarations.push(nativeEmit(language, 'TreeNode', '_practice_encoded ? ' + treeCodec.deserialize + '(_practice_encoded) : NULL'));
    } else {
      declarations.push(nativeEmit(language, 'TreeNode', target + treeCodec.deserialize + '(' + call + ')'));
    }
  } else if (treeResult || signature.fixture === 'sharedListTail') {
    const list = signature.fixture === 'sharedListTail';
    const printValue = {
      java: 'emit(Practice' + (list ? 'List' : 'Tree') + '.value(' + call + '));',
      cpp: 'practice_nodes::emitValue(' + call + ');',
      c: '_practice_' + (list ? 'list' : 'tree') + '_value(' + call + ');',
    };
    declarations.push(printValue[language]);
  } else if (output !== undefined) {
    const actual = names[output]!;
    declarations.push(call + ';');
    if (language === 'c' && isCArray(resultType)) {
      declarations.push(cArrayPrint(resultType, actual, String((args[output]!.value as Value[]).length), actual + '_widths'));
    } else declarations.push(nativeEmit(language, resultType, actual));
  } else if (language === 'c' && isCArray(resultType)) {
    declarations.push(...cArrayReturn(resultType, fn, pass, '_practice_result'));
  } else declarations.push(nativeEmit(language, resultType, call));
  return nativeProgram(language, code, className, declarations, nodeTypes([...args.map(({ type }) => type), resultType]),
    boundary === undefined ? '' : boundaryPrelude(language, boundary));
}

function dynamicDesign(language: DynamicLanguage, code: string, design: z.infer<typeof designContract>, operations: string[], args: Value[][], sample: WeightedPlan | null) {
  const python = language === 'python';
  const keepVoid = design.resultMode === 'all';
  const constructorResult = !sample && keepVoid && design.includeConstructor !== false;
  const signatures = design.signatures;
  const types = signatures && nodeTypes([...signatures.constructorArgs, ...Object.values(signatures.methods).flatMap(({ args, returns }) => [...args, returns])]);
  const invoke = (i: number) => args[i]!.map((value, j) => {
    const type = i === 0 ? signatures?.constructorArgs[j] : signatures?.methods[operations[i]!]?.args[j];
    const literal = python ? '_practice_values[' + i + '][' + j + ']' : JSON.stringify(value);
    return dynamicInput(language, type, literal);
  }).join(', ');
  const operationLine = (name: string, i: number) => {
    const call = '_practice_obj.' + name + '(' + invoke(i + 1) + ')';
    const type = signatures?.methods[name]?.returns;
    if (type === 'void') return call + (python ? keepVoid ? '\n_practice_items.append(None)' : '' : keepVoid ? ';\n_practice_items.push(null);' : ';');
    const result = type && isNodeType(type) ? dynamicHelper(type) + '_json(' + call + ')' : call;
    if (python) return '_practice_items.append(' + result + ')';
    return !signatures && !keepVoid
      ? '{ const val = ' + result + '; if (val !== undefined) _practice_items.push(val); }'
      : '{ const val = ' + result + '; _practice_items.push(val === undefined ? null : val); }';
  };
  const lines = sample
    ? [python
      ? 'for _practice_draw in range(' + weightedSampleCount + '): _practice_items.append(_practice_obj.' + sample.method + '())'
      : 'for (let _practice_draw = 0; _practice_draw < ' + weightedSampleCount + '; _practice_draw++) _practice_items.push(_practice_obj.' + sample.method + '());']
    : operations.slice(1).map(operationLine);
  const prelude = nodePrelude(language, types ?? new Set());
  if (python) {
    const result = signatures || keepVoid ? '_practice_items' : '[item for item in _practice_items if item is not None]';
    return (types?.size ? 'from __future__ import annotations\n' : '') + code +
      '\nimport json as _practice_json\n' + prelude + '\n_practice_values = _practice_json.loads(' + JSON.stringify(JSON.stringify(args)) + ')\n' +
      '_practice_obj = ' + design.className + '(' + invoke(0) + ')\n_practice_items = ' + (constructorResult ? '[None]' : '[]') + '\n' +
      lines.join('\n') + '\nprint(_practice_json.dumps(' + result + '))\n';
  }
  return code + '\n;' + prelude + '\n{ const _practice_obj = new ' + design.className + '(' + invoke(0) + ');\n' +
    'const _practice_items' + (language === 'typescript' ? ': unknown[]' : '') + ' = ' +
    (constructorResult ? '[null]' : '[]') + ';\n' + lines.join('\n') +
    '\nconsole.log(JSON.stringify(_practice_items)); }\n' + (language === 'typescript' && types?.has('GraphNode') ? 'export {};\n' : '');
}

function nativeDesign(language: NativeLanguage, code: string, design: z.infer<typeof designContract>, operations: string[], args: Value[][], sample: WeightedPlan | null) {
  const { className, resultMode, signatures } = design;
  if (!signatures) invalid();
  const ctor = nativeArguments(language, typedArguments(signatures.constructorArgs, args[0]!), '_practice_ctor_');
  const call = ctor.pass.join(', ');
  const initialize = language === 'java' ? className + ' instance = new ' + className + '(' + call + ');'
    : language === 'cpp' ? className + ' instance{' + call + '};'
    : className + '* instance = ' + className + '_create(' + call + ');';
  const print = (text: string) => {
    const value = JSON.stringify(text);
    if (language === 'java') return 'System.out.print(' + value + ');';
    if (language === 'cpp') return 'std::cout << ' + value + ';';
    return 'fputs(' + value + ', stdout);';
  };
  const all = resultMode === 'all';
  const constructorResult = !sample && all && design.includeConstructor !== false;
  const body = [...ctor.declarations, initialize, print(constructorResult ? '[null' : '[')];
  const used = new Set(nodeTypes(signatures.constructorArgs));
  if (sample) {
    const draw = language === 'c' ? className + '_' + sample.method + '(instance)' : 'instance.' + sample.method + '()';
    body.push('for (int _practice_draw = 0; _practice_draw < ' + weightedSampleCount + '; _practice_draw++) {',
      'if (_practice_draw != 0) ' + print(','), nativeEmit(language, 'int', draw), '}', print(']'));
    return nativeProgram(language, code, className, body, used);
  }
  let separator = constructorResult;
  operations.slice(1).forEach((name, i) => {
    const signature = signatures.methods[name]!;
    const argsForCall = nativeArguments(language, typedArguments(signature.args, args[i + 1]!), '_practice_op_' + i + '_');
    for (const type of nodeTypes([...signature.args, signature.returns])) used.add(type);
    const method = language === 'c' ? className + '_' + name : 'instance.' + name;
    const pass = language === 'c' ? ['instance', ...argsForCall.pass] : argsForCall.pass;
    const nativeCall = method + '(' + pass.join(', ') + ')';
    body.push(...argsForCall.declarations);
    if (signature.returns === 'void') body.push(nativeCall + ';');
    if (signature.returns !== 'void' || all) {
      if (separator) body.push(print(','));
      if (language === 'c' && isCArray(signature.returns)) {
        body.push(...cArrayReturn(signature.returns, method, pass, '_practice_result_' + i));
      } else body.push(signature.returns === 'void' ? print('null') : nativeEmit(language, signature.returns, nativeCall));
      separator = true;
    }
  });
  body.push(print(']'));
  return nativeProgram(language, code, className, body, used);
}

export function buildDriver(language: PracticeLanguage, suite: Suite, inputJson: string, code: string, expectedOutputJson?: string): string {
  const parsed = inputs.safeParse(JSON.parse(inputJson));
  if (!parsed.success) invalid();
  const native = language === 'java' || language === 'cpp' || language === 'c';
  if (suite.designContract != null) {
    const design = designContract.safeParse(suite.designContract);
    const sequence = commands.safeParse(parsed.data);
    if (!design.success || !sequence.success) invalid();
    const { operations, arguments: args } = sequence.data;
    if (operations[0] !== design.data.className || operations.length !== args.length) invalid();
    const signatures = design.data.signatures;
    if (signatures) {
      typedArguments(signatures.constructorArgs, args[0]!);
      operations.slice(1).forEach((name, i) => {
        if (!Object.hasOwn(signatures.methods, name)) invalid();
        typedArguments(signatures.methods[name]!.args, args[i + 1]!);
      });
    }
    const sample = weightedPlan(design.data, inputJson, expectedOutputJson);
    return native ? nativeDesign(language, code, design.data, operations, args, sample) : dynamicDesign(language, code, design.data, operations, args, sample);
  }
  if (!identifier.safeParse(suite.functionName).success) invalid();
  const args = suite.parameterOrder.map((name) => {
    if (!Object.hasOwn(parsed.data, name)) invalid();
    return parsed.data[name]!;
  });
  if (suite.nativeSignature != null) {
    const signature = nativeSignature.safeParse(suite.nativeSignature);
    if (!signature.success) invalid();
    const contract = signature.data;
    let typed = typedArguments(contract.args, args, contract.treeReferences);
    let boundary: number | undefined;
    if (contract.fixture) {
      const prepared = prepareFixture(contract.fixture, args);
      boundary = prepared.boundary;
      const types: ValueType[] = contract.fixture === 'sharedListTail' ? ['ListNode', 'ListNode', 'ListNode'] : contract.args;
      typed = typedArguments(types.slice(0, prepared.inputs.length), prepared.inputs as Value[]);
    }
    if (native) return nativeFunction(language, code, suite.functionName, typed, contract, boundary);
    return dynamicFunction(language, code, suite.functionName, typed.map(({ value }) => value), contract, typed, boundary);
  }
  if (native) invalid();
  return dynamicFunction(language, code, suite.functionName, args);
}
