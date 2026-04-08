import type { MiddlewareHandler } from "hono";
import { deleteOperatorSession, type ControlPlaneAuthConfig, authenticatePrincipal, authRedirectTarget, isPublicAuthPath } from "./control-plane-auth";

export function createAuthMiddleware(config: ControlPlaneAuthConfig): MiddlewareHandler {
  return async (context, next) => {
    if (!config.enabled) {
      context.set("principal", { role: "operator", source: "bearer" });
      return next();
    }

    if (isPublicAuthPath(context.req.path)) {
      return next();
    }

    const principal = await authenticatePrincipal(context, config);
    if (!principal) {
      if (wantsHtml(context.req.header("accept"))) {
        return context.redirect(`/login?next=${encodeURIComponent(authRedirectTarget(context.req.raw))}`);
      }

      deleteOperatorSession(context);
      context.header("WWW-Authenticate", 'Bearer realm="control-plane"');
      return context.json({ error: "unauthorized" }, 401);
    }

    if (requiresOperator(context.req.path, context.req.method) && principal.role !== "operator") {
      return context.json({ error: "forbidden" }, 403);
    }

    context.set("principal", principal);
    return next();
  };
}

function requiresOperator(pathname: string, method: string): boolean {
  if (pathname === "/logout") {
    return false;
  }

  if (pathname.startsWith("/api/")) {
    return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  }

  return false;
}

function wantsHtml(acceptHeader: string | undefined): boolean {
  return acceptHeader?.includes("text/html") ?? false;
}
