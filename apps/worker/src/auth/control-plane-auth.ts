import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { ControlPlaneError } from "../../../../packages/shared/src/control-plane-error";
import type { WorkerEnv } from "../services";

const SESSION_COOKIE = "control_plane_session";
const OPERATOR_SESSION_TTL_SECONDS = 60 * 60 * 12;

export type ControlPlaneRole = "viewer" | "operator";

export interface ControlPlanePrincipal {
  role: ControlPlaneRole;
  source: "bearer" | "cookie";
}

interface ControlPlaneSession {
  role: ControlPlaneRole;
  expiresAt: string;
}

export interface ControlPlaneAuthConfig {
  enabled: boolean;
  operatorToken?: string;
  viewerToken?: string;
  appPassword?: string;
  cookieSecret?: string;
}

export function resolveAuthConfig(env?: WorkerEnv): ControlPlaneAuthConfig {
  const operatorToken = nonEmpty(env?.CONTROL_PLANE_OPERATOR_TOKEN);
  const viewerToken = nonEmpty(env?.CONTROL_PLANE_VIEWER_TOKEN);
  const appPassword = nonEmpty(env?.CONTROL_PLANE_APP_PASSWORD) ?? operatorToken;
  const cookieSecret = nonEmpty(env?.CONTROL_PLANE_COOKIE_SECRET) ?? operatorToken ?? appPassword;

  return {
    enabled: Boolean(operatorToken || viewerToken || appPassword),
    operatorToken,
    viewerToken,
    appPassword,
    cookieSecret,
  };
}

export async function authenticatePrincipal(
  context: Context,
  config: ControlPlaneAuthConfig,
): Promise<ControlPlanePrincipal | null> {
  if (!config.enabled) {
    return { role: "operator", source: "bearer" };
  }

  const bearer = authenticateBearer(context.req.header("authorization"), config);
  if (bearer) {
    return bearer;
  }

  if (!config.cookieSecret) {
    return null;
  }

  const signed = await getSignedCookie(context, config.cookieSecret, SESSION_COOKIE).catch(() => false);
  if (!signed || typeof signed !== "string") {
    return null;
  }

  const session = parseSession(signed);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    deleteOperatorSession(context);
    return null;
  }

  return { role: session.role, source: "cookie" };
}

export function isOperator(principal: ControlPlanePrincipal | null | undefined): boolean {
  return principal?.role === "operator";
}

export function getPrincipal(context: Context): ControlPlanePrincipal | null {
  return (context.get("principal") as ControlPlanePrincipal | undefined) ?? null;
}

export async function issueOperatorSession(context: Context, config: ControlPlaneAuthConfig): Promise<void> {
  if (!config.cookieSecret) {
    throw new ControlPlaneError(500, "cookie_secret_required");
  }

  const expiresAt = new Date(Date.now() + OPERATOR_SESSION_TTL_SECONDS * 1000).toISOString();
  await setSignedCookie(
    context,
    SESSION_COOKIE,
    JSON.stringify({ role: "operator", expiresAt } satisfies ControlPlaneSession),
    config.cookieSecret,
    {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: new URL(context.req.url).protocol === "https:",
      maxAge: OPERATOR_SESSION_TTL_SECONDS,
    },
  );
}

export function deleteOperatorSession(context: Context): void {
  deleteCookie(context, SESSION_COOKIE, { path: "/" });
}

export function ensureOperatorAccess(principal: ControlPlanePrincipal | null | undefined): void {
  if (!isOperator(principal)) {
    throw new ControlPlaneError(403, "forbidden");
  }
}

export function isPublicAuthPath(pathname: string): boolean {
  return pathname === "/healthz" || pathname === "/login" || pathname === "/mcp/app";
}

export function authRedirectTarget(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export function loginPasswordMatches(password: string, config: ControlPlaneAuthConfig): boolean {
  return Boolean(config.appPassword && password === config.appPassword);
}

function authenticateBearer(
  authorizationHeader: string | undefined,
  config: ControlPlaneAuthConfig,
): ControlPlanePrincipal | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (config.operatorToken && token === config.operatorToken) {
    return { role: "operator", source: "bearer" };
  }

  if (config.viewerToken && token === config.viewerToken) {
    return { role: "viewer", source: "bearer" };
  }

  return null;
}

function parseSession(value: string): ControlPlaneSession | null {
  try {
    const parsed = JSON.parse(value) as Partial<ControlPlaneSession>;
    if (!parsed || (parsed.role !== "viewer" && parsed.role !== "operator") || typeof parsed.expiresAt !== "string") {
      return null;
    }
    return { role: parsed.role, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}
