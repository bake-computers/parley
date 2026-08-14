import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
};

/**
 * Per-request context (request_id) so engine RPCs can forward the same
 * X-Request-ID that the wide event carries.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
