import type { MiddlewareHandler } from "hono";
import type { ControlPlanePrincipal } from "../auth/control-plane-auth";

export function createRequestTracingMiddleware(): MiddlewareHandler {
  return async (context, next) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const traceId = requestId;
    context.set("requestId", requestId);
    context.set("traceId", traceId);
    context.header("x-request-id", requestId);
    context.header("x-trace-id", traceId);

    await next();

    const principal = context.get("principal") as ControlPlanePrincipal | undefined;
    console.log(JSON.stringify({
      traceId,
      requestId,
      actorId: principal?.role ?? "anonymous",
      outcome: context.res.status,
      method: context.req.method,
      path: context.req.path,
      durationMs: Date.now() - startedAt,
    }));
  };
}
