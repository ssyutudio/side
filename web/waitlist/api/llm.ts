// POST /api/llm {system, prompt, maxTokens?} with
//   Authorization: Bearer <license key>
//   X-Side-Instance: <instance id from activation>
// Side Pro's Claude requests. The license must be active on that Mac and within today's limit.
// Nothing about the request is stored: only a count per license per day.
import { getSql, type SqlTag } from '../lib/db.js';
import { complete, getClaude, type MessagesClient } from '../lib/claude.js';
import { entitled, spendOne } from '../lib/entitlement.js';
import { header, methodNotAllowed, readBody, sendJson, type ReqLike, type ResLike } from '../lib/http.js';
import { createLemon, lemonConfig, type Lemon } from '../lib/lemon.js';
import { INSTANCE_ID, LICENSE_KEY, validateLlm } from '../lib/validate.js';

export function createLlmHandler(deps: { lemon: () => Lemon | null; sql: () => SqlTag; claude: () => MessagesClient }) {
  return async function handler(req: ReqLike, res: ResLike): Promise<void> {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') return methodNotAllowed(res, 'POST');
    const key = (header(req, 'authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const instanceId = (header(req, 'x-side-instance') ?? '').trim();
    if (!LICENSE_KEY.test(key) || !INSTANCE_ID.test(instanceId)) {
      return sendJson(res, 401, { ok: false, reason: 'Activate Side Pro on this Mac first.' });
    }
    const body = readBody(req);
    if (!body.ok) return sendJson(res, 400, { ok: false, reason: 'The request body is not valid JSON.' });
    const v = validateLlm(body.body);
    if (!v.ok) return sendJson(res, v.status, { ok: false, reason: v.reason });

    const lemon = deps.lemon();
    if (!lemon) return sendJson(res, 503, { ok: false, reason: 'Side Pro is not set up on this server yet.' });
    let sql: SqlTag;
    try {
      sql = deps.sql();
      const e = await entitled(sql, lemon, key, instanceId);
      if (!e.ok) return sendJson(res, e.status, { ok: false, reason: e.reason, license: e.license });
      if (!(await spendOne(sql, key))) {
        return sendJson(res, 429, { ok: false, reason: "Today's Claude requests for this license are used up. Side uses simple rules until tomorrow." });
      }
    } catch {
      return sendJson(res, 503, { ok: false, reason: 'Side Pro is not reachable right now.' });
    }

    const out = await complete(deps.claude(), v.value);
    return out.ok ? sendJson(res, 200, { ok: true, text: out.text }) : sendJson(res, 502, { ok: false, reason: out.reason });
  };
}

export default createLlmHandler({
  lemon: () => {
    const cfg = lemonConfig(process.env);
    return cfg ? createLemon(cfg, fetch) : null;
  },
  sql: () => getSql(),
  claude: () => getClaude(),
});
