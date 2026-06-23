export function toBridgeRequest(request: Request, bridgePath: string): Request {
  const url = new URL(request.url);
  const target = new URL(`https://bridge.internal${bridgePath}`);
  target.search = url.search;

  const headers = new Headers(request.headers);
  // Same-origin browser fetches often omit Origin; bridge allowlists by Origin.
  headers.set("Origin", url.origin);

  return new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
  });
}
