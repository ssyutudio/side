// Test doubles for the Vercel handlers: a recording sql tag and a minimal response.
import type { SqlTag } from './db.js';
import type { ResLike } from './http.js';

export interface FakeSql {
  tag: SqlTag;
  calls: { text: string; values: unknown[] }[];
}

/** Returns the queued row sets in order, one per query, and records each query. */
export function fakeSql(results: unknown[][]): FakeSql {
  const queue = [...results];
  const calls: FakeSql['calls'] = [];
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values });
    return Promise.resolve(queue.shift() ?? []);
  }) as SqlTag;
  return { tag, calls };
}

export interface FakeRes extends ResLike {
  headers: Record<string, string>;
  body: string;
  json(): any;
}

export function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      res.body = chunk ?? '';
    },
    json() {
      return JSON.parse(res.body);
    },
  };
  return res;
}
