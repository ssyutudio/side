// POST /api/license {action, licenseKey, ...} -> Side Pro on this Mac.
//   activate   {licenseKey, instanceName}  -> uses one activation; answers {ok, instanceId, status, expiresAt, plan}
//   validate   {licenseKey, instanceId}    -> {ok, status, expiresAt, plan} (Settings refresh)
//   deactivate {licenseKey, instanceId}    -> frees this Mac's activation
// The key itself is never stored; only a hash of it, in the entitlement cache.
import { getSql, type SqlTag } from '../lib/db.js';
import { forget } from '../lib/entitlement.js';
import { methodNotAllowed, readBody, sendJson, type ReqLike, type ResLike } from '../lib/http.js';
import { createLemon, lemonConfig, type Lemon } from '../lib/lemon.js';
import { validateLicense } from '../lib/validate.js';

export function createLicenseHandler(deps: { lemon: () => Lemon | null; sql: () => SqlTag }) {
  return async function handler(req: ReqLike, res: ResLike): Promise<void> {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') return methodNotAllowed(res, 'POST');
    const body = readBody(req);
    if (!body.ok) return sendJson(res, 400, { ok: false, reason: 'The request body is not valid JSON.' });
    const v = validateLicense(body.body);
    if (!v.ok) return sendJson(res, v.status, { ok: false, reason: v.reason });
    const lemon = deps.lemon();
    if (!lemon) return sendJson(res, 503, { ok: false, reason: 'Side Pro is not set up on this server yet.' });
    const b = v.value;

    if (b.action === 'deactivate') {
      const out = await lemon.deactivate(b.licenseKey, b.instanceId);
      // The cached "yes" goes either way: this Mac asked to stop being Pro.
      await forget(deps.sql(), b.licenseKey, b.instanceId).catch(() => undefined);
      return sendJson(res, out.ok ? 200 : 400, out);
    }

    const out = b.action === 'activate' ? await lemon.activate(b.licenseKey, b.instanceName) : await lemon.validate(b.licenseKey, b.instanceId);
    if (!out.ok) return sendJson(res, out.kind === 'unavailable' ? 503 : 400, { ok: false, reason: out.reason });
    return sendJson(res, 200, {
      ok: true,
      instanceId: out.instanceId,
      status: out.license.status,
      expiresAt: out.license.expiresAt,
      plan: out.license.plan,
    });
  };
}

export default createLicenseHandler({
  lemon: () => {
    const cfg = lemonConfig(process.env);
    return cfg ? createLemon(cfg, fetch) : null;
  },
  sql: () => getSql(),
});
