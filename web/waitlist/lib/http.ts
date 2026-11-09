// Minimal request/response shapes so handlers run on Vercel and in tests alike.

export interface ReqLike {
  method?: string;
  body?: unknown;
}

export interface ResLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

export function sendJson(res: ResLike, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function methodNotAllowed(res: ResLike, allow: string): void {
  res.setHeader('Allow', allow);
  sendJson(res, 405, { ok: false, reason: `Use ${allow}.` });
}

/** Vercel parses JSON bodies lazily and throws on invalid JSON; treat that as a broken body. */
export function readBody(req: ReqLike): { ok: true; body: unknown } | { ok: false } {
  try {
    return { ok: true, body: req.body };
  } catch {
    return { ok: false };
  }
}

export const DB_DOWN_REASON = 'The waitlist is not reachable right now. Please try again in a minute.';
