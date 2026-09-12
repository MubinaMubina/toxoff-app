// Errors thrown with a status end up as { error: message } — src/lib/api.ts shows `error` to the user.
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid request body.');
  }
  return body;
}
