const arrayTypes = ['int[]', 'int[][]', 'char[]', 'char[][]', 'string[]', 'string[][]'] as const;
type CArrayType = typeof arrayTypes[number];
type Element = number | string;

export function isCArray(type: string): type is CArrayType {
  return arrayTypes.some((item) => item === type);
}

function matrix(type: CArrayType) { return type.endsWith('[][]'); }
function strings(type: CArrayType) { return !type.startsWith('int'); }
function elementType(type: CArrayType) { return strings(type) ? 'char*' : 'int'; }

export function cArrayArgument(type: CArrayType, value: Element[] | Element[][], name: string, quote: (text: string) => string) {
  const declarations: string[] = [];
  function row(items: Element[], binding: string) {
    const values = items.map((item, i) => {
      if (typeof item === 'number') return String(item);
      const cell = binding + '_cell_' + i;
      declarations.push('char ' + cell + '[] = ' + quote(item) + ';');
      return cell;
    });
    declarations.push(elementType(type) + ' ' + binding + '[] = {' + (values.join(', ') || '0') + '};');
  }
  if (!matrix(type)) {
    row(value as Element[], name);
    return { declarations, pass: [name, String(value.length)] };
  }
  const rows = value as Element[][];
  const bindings = rows.map((items, i) => {
    const binding = name + '_row_' + i;
    row(items, binding);
    return binding;
  });
  declarations.push(elementType(type) + '* ' + name + '[] = {' + (bindings.join(', ') || 'NULL') + '};');
  declarations.push('int ' + name + '_widths[] = {' + (rows.map((items) => items.length).join(', ') || '0') + '};');
  return { declarations, pass: [name, String(rows.length), name + '_widths'] };
}

export function cArrayPrint(type: CArrayType, value: string, count: string, widths?: string) {
  const printer = strings(type) ? '_practice_strings' : '_practice_ints';
  if (!matrix(type)) return printer + '(' + value + ', ' + count + ');';
  if (!widths) throw new Error('C matrix output is missing column counts.');
  return [
    'if (' + count + ' < 0 || (' + count + ' && (!' + value + ' || !' + widths + '))) exit(1);',
    'putchar(91);',
    'for (int i = 0; i < ' + count + '; i++) {',
    '  if (i) putchar(44);',
    '  ' + printer + '(' + value + '[i], ' + widths + '[i]);',
    '}',
    'putchar(93);',
  ].join('\n    ');
}

export function cArrayReturn(type: CArrayType, functionName: string, args: string[], name: string) {
  const size = name + '_size';
  const widths = matrix(type) ? name + '_widths' : undefined;
  const declarations = ['int ' + size + ' = 0;'];
  const pass = [...args, '&' + size];
  if (widths) {
    declarations.push('int *' + widths + ' = NULL;');
    pass.push('&' + widths);
  }
  declarations.push(elementType(type) + (widths ? '** ' : '* ') + name + ' = ' + functionName + '(' + pass.join(', ') + ');');
  declarations.push(cArrayPrint(type, name, size, widths));
  return declarations;
}

export const cArrayHelpers = `
static void _practice_ints(const int *items, int count) {
  if (count < 0 || (count && !items)) exit(1);
  putchar('[');
  for (int i = 0; i < count; i++) {
    if (i) putchar(',');
    printf("%d", items[i]);
  }
  putchar(']');
}

static void _practice_strings(char *const *items, int count) {
  if (count < 0 || (count && !items)) exit(1);
  putchar('[');
  for (int i = 0; i < count; i++) {
    if (i) putchar(',');
    _practice_string(items[i]);
  }
  putchar(']');
}`;
