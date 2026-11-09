// POST /api/join {email, consent} -> one row per email. GET /api/join -> {count}.
import { getSql, type SqlTag } from '../lib/db';
import { DB_DOWN_REASON, methodNotAllowed, readBody, sendJson, type ReqLike, type ResLike } from '../lib/http';
import { validateJoin } from '../lib/validate';

async function countRows(sql: SqlTag): Promise<number> {
  const rows = await sql<{ count: number }>`select count(*)::int as count from waitlist`;
  return Number(rows[0]?.count ?? 0);
}

export function createJoinHandler(sqlFactory: () => SqlTag) {
  return async function handler(req: ReqLike, res: ResLike): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') return methodNotAllowed(res, 'GET, POST');

    let input: unknown;
    if (method === 'POST') {
      const body = readBody(req);
      if (!body.ok) return sendJson(res, 400, { ok: false, reason: 'The request body is not valid JSON.' });
      const v = validateJoin(body.body);
      if (!v.ok) return sendJson(res, v.status, { ok: false, reason: v.reason });
      input = v.value.email;
    }

    try {
      const sql = sqlFactory();
      if (method === 'GET') return sendJson(res, 200, { count: await countRows(sql) });
      const inserted = await sql<{ id: number }>`insert into waitlist (email) values (${input}) on conflict do nothing returning id`;
      const count = await countRows(sql);
      return sendJson(res, 200, { ok: true, joined: inserted.length > 0, count });
    } catch {
      return sendJson(res, 503, { ok: false, reason: DB_DOWN_REASON });
    }
  };
}

export default createJoinHandler(() => getSql());
