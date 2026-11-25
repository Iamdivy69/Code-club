import { afterEach, describe, expect, it, vi } from 'vitest';
import { judge0 } from '../src/modules/practice/judge.js';
import { buildDriver } from '../src/modules/practice/drivers.js';
import { languages } from '../src/modules/practice/languages.js';
import { evaluate, outputsMatch } from '../src/modules/practice/evaluation.js';

afterEach(() => vi.unstubAllGlobals());

describe('Judge0 contract', () => {
  it('uses the Code Club runtime and limits and decodes a base64 response', async () => {
    const fetchMock = vi.fn<(url: URL, options: RequestInit) => Promise<Response>>().mockResolvedValue(new Response(JSON.stringify({
      status: { id: 3 }, stdout: Buffer.from('2\n').toString('base64'), time: '0.013', memory: 1240,
    })));
    vi.stubGlobal('fetch', fetchMock);
    const source = 'console.log("ñ")';
    expect(await judge0('http://127.0.0.1:2358/submissions', 'test-key')(source))
      .toMatchObject({ stdout: '2\n', status: 3, time: .013, memory: 1240 });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url.searchParams.get('base64_encoded')).toBe('true');
    expect(url.searchParams.get('wait')).toBe('true');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'X-Auth-Token': 'test-key' } });
    expect(JSON.parse(String(options.body))).toMatchObject({
      source_code: Buffer.from(source).toString('base64'), language_id: 63, cpu_time_limit: 2,
      wall_time_limit: 5, memory_limit: 256_000, max_processes_and_or_threads: 60, max_file_size: 1024,
    });
  });

  it('polls the same Judge0 origin after an explicit wait rejection', async () => {
    const token = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.fn<(url: URL, options?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ error: 'wait not allowed' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ token }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ status: { id: 2 } }))
      .mockResolvedValueOnce(Response.json({ status: { id: 3 }, stdout: Buffer.from('caf\u00e9\n').toString('base64') }));
    vi.stubGlobal('fetch', fetchMock);
    const source = 'print(input())';
    const execute = judge0('https://example.test/judge/submissions', 'fixture-key', { rapidApiKey: 'fixture-gateway-key' });
    expect(await execute(source, 'python', 'caf\u00e9\n')).toMatchObject({ status: 3, stdout: 'caf\u00e9\n' });
    const [wait, ticket, reading, terminal] = fetchMock.mock.calls;
    expect(wait?.[0].searchParams.get('wait')).toBe('true');
    expect(ticket?.[0].searchParams.get('wait')).toBe('false');
    expect(JSON.parse(String(ticket?.[1]?.body)).stdin).toBe(Buffer.from('caf\u00e9\n').toString('base64'));
    expect(reading?.[0]).toMatchObject({ origin: 'https://example.test', pathname: '/judge/submissions/' + token });
    expect(reading?.[0].searchParams.get('wait')).toBeNull();
    const credentials = {
      'X-Auth-Token': 'fixture-key', 'X-RapidAPI-Key': 'fixture-gateway-key', 'X-RapidAPI-Host': 'example.test',
    };
    expect(ticket?.[1]?.headers).toMatchObject(credentials);
    expect(reading?.[1]?.headers).toMatchObject(credentials);
    expect(terminal?.[0].href).toBe(reading?.[0].href);
  });

  it('returns unavailable for an ambiguous POST failure without submitting the same program again', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Connection ended'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(judge0('http://127.0.0.1:2358/submissions')('source')).rejects.toMatchObject({ code: 'JUDGE_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable judging when the provider is absent or returns an invalid body', async () => {
    await expect(judge0()('source')).rejects.toMatchObject({ statusCode: 503 });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"token":"pending"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(judge0('http://127.0.0.1:2358/submissions')('source')).rejects.toMatchObject({ statusCode: 503 });
  });
});

it('maps all six production language IDs and builds function drivers with typed arguments', async () => {
  const fetchMock = vi.fn<(url: URL, options: RequestInit) => Promise<Response>>().mockImplementation(async () =>
    new Response(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from('2').toString('base64') })));
  vi.stubGlobal('fetch', fetchMock);
  const ids = [];
  for (const language of Object.values(languages)) {
    const source = buildDriver(language.key, { functionName: 'countAbove', parameterOrder: ['values', 'threshold'],
      comparisonMode: 'EXACT', nativeSignature: { args: ['int[]', 'int'], returns: 'int' },
    }, '{"values":[5,6],"threshold":4}', '/* exercise source */');
    expect(source).toContain('countAbove');
    await judge0('http://127.0.0.1:2358/submissions')(source, language.key);
    ids.push(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body)).language_id);
  }
  expect(ids).toEqual([71, 63, 62, 54, 50, 74]);
});

it('generates constructor and operation calls in order', () => {
  const source = buildDriver('javascript', { functionName: 'Counter', parameterOrder: [], comparisonMode: 'EXACT',
    designContract: { className: 'Counter', resultMode: 'all' },
  }, '{"operations":["Counter","add","value"],"arguments":[[],[7],[]]}', 'class Counter {}');
  expect(source).toContain('new Counter()');
  expect(source.indexOf('_practice_obj.add(7)')).toBeLessThan(source.indexOf('_practice_obj.value()'));
});

describe('judge behavior', () => {
  it('keeps duplicate elements and only ignores top-level array order', () => {
    expect(outputsMatch('[[1,2],[3],[3]]', '[[3],[1,2],[3]]', 'UNORDERED')).toBe(true);
    expect(outputsMatch('[[1,2],[3],[3]]', '[[3],[2,1],[3]]', 'UNORDERED')).toBe(false);
    expect(outputsMatch('[[1,2],[3],[3]]', '[[3],[1,2]]', 'UNORDERED')).toBe(false);
    expect(outputsMatch('a\r\nb', 'a\nb', 'EXACT')).toBe(true);
  });

  it('invokes the function in the authored parameter order and recognizes failed engine statuses', async () => {
    const suite = { functionName: 'countAbove', parameterOrder: ['values', 'threshold'], comparisonMode: 'EXACT' as const };
    const test = { position: 0, hidden: false, inputJson: '{"threshold":4,"values":[5,6]}', expectedOutputJson: '2' };
    const execute = vi.fn().mockResolvedValue({ status: 5, stdout: '2\n', stderr: '', compileOutput: '', time: null, memory: null });
    expect((await evaluate(execute, suite, test, 'function countAbove(){}')).verdict).toBe('TIME_LIMIT_EXCEEDED');
    expect(execute.mock.calls[0]?.[0]).toContain('countAbove([5,6], 4)');
  });
});
