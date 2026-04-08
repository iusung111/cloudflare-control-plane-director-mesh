import type { Context } from "hono";
import { ControlPlaneError } from "../../../../packages/shared/src/control-plane-error";

export async function readJson<T>(context: Context): Promise<T> {
  try {
    return await context.req.json<T>();
  } catch {
    throw new ControlPlaneError(400, "invalid_json");
  }
}

export function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ControlPlaneError(400, code);
  }

  return value.trim();
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ControlPlaneError(400, "invalid_numeric_value");
  }

  return value;
}
