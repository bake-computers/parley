import { createParleyAuth } from "@parley/auth";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { createRuntimeDbHandle, ManagedExecutionContext } from "./runtime-db";
import type { WorkerEnv } from "./env";

function authUnavailableResponse(): Response {
  return Response.json(
    {
      error: "auth_unavailable",
      message: "Authentication is unavailable because the database connection is offline.",
    },
    { status: 503 },
  );
}

export async function handleAuthRequest(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const handle = await createRuntimeDbHandle(env);
  if (!handle.env.db) {
    await handle.close();
    return authUnavailableResponse();
  }

  const managedContext = new ManagedExecutionContext(ctx, handle.close);

  try {
    const auth = createParleyAuth(handle.env.db, handle.env);
    return await auth.handler(request);
  } finally {
    managedContext.markResponseReturned();
  }
}
