// POST /api/usage -> anonymous counts for one install (opt-in, off by default).
// GET /api/usage -> totals across installs, for the deck. Numbers only.
import { getSql, type SqlTag } from '../lib/db';
import { DB_DOWN_REASON, methodNotAllowed, readBody, sendJson, type ReqLike, type ResLike } from '../lib/http';
import { validateUsage } from '../lib/validate';

interface TotalsRow {
  installs: number;
  tabs_set_aside: number;
  lines_set_aside: number;
  sidy_spoke: number;
  steps_shown: number;
  steps_clicked: number;
  still_working_10m: number;
}

async function totals(sql: SqlTag) {
  const rows = await sql<TotalsRow>`select count(*)::int as installs,
    coalesce(sum(tabs_set_aside), 0)::int as tabs_set_aside,
    coalesce(sum(lines_set_aside), 0)::int as lines_set_aside,
    coalesce(sum(sidy_spoke), 0)::int as sidy_spoke,
    coalesce(sum(steps_shown), 0)::int as steps_shown,
    coalesce(sum(steps_clicked), 0)::int as steps_clicked,
    coalesce(sum(still_working_10m), 0)::int as still_working_10m
    from usage_counts`;
  const r = rows[0];
  return {
    installs: Number(r?.installs ?? 0),
    tabsSetAside: Number(r?.tabs_set_aside ?? 0),
    linesSetAside: Number(r?.lines_set_aside ?? 0),
    sidySpoke: Number(r?.sidy_spoke ?? 0),
    stepsShown: Number(r?.steps_shown ?? 0),
    stepsClicked: Number(r?.steps_clicked ?? 0),
    stillWorking10m: Number(r?.still_working_10m ?? 0),
  };
}

export function createUsageHandler(sqlFactory: () => SqlTag) {
  return async function handler(req: ReqLike, res: ResLike): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') return methodNotAllowed(res, 'GET, POST');

    if (method === 'GET') {
      try {
        return sendJson(res, 200, await totals(sqlFactory()));
      } catch {
        return sendJson(res, 503, { ok: false, reason: DB_DOWN_REASON });
      }
    }

    const body = readBody(req);
    if (!body.ok) return sendJson(res, 400, { ok: false, reason: 'The request body is not valid JSON.' });
    const v = validateUsage(body.body);
    if (!v.ok) return sendJson(res, v.status, { ok: false, reason: v.reason });
    const u = v.value;
    try {
      const sql = sqlFactory();
      await sql`insert into usage_counts (install_id, tabs_set_aside, lines_set_aside, sidy_spoke, steps_shown, steps_clicked, still_working_10m)
        values (${u.installId}, ${u.tabsSetAside}, ${u.linesSetAside}, ${u.sidySpoke}, ${u.stepsShown}, ${u.stepsClicked}, ${u.stillWorking10m})
        on conflict (install_id) do update set
          tabs_set_aside = excluded.tabs_set_aside,
          lines_set_aside = excluded.lines_set_aside,
          sidy_spoke = excluded.sidy_spoke,
          steps_shown = excluded.steps_shown,
          steps_clicked = excluded.steps_clicked,
          still_working_10m = excluded.still_working_10m,
          updated_at = now()`;
      return sendJson(res, 200, { ok: true });
    } catch {
      return sendJson(res, 503, { ok: false, reason: DB_DOWN_REASON });
    }
  };
}

export default createUsageHandler(() => getSql());
