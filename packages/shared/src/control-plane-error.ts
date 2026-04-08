export class ControlPlaneError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "ControlPlaneError";
  }
}

export function asControlPlaneError(error: unknown): ControlPlaneError {
  if (error instanceof ControlPlaneError) {
    return error;
  }

  if (error instanceof Error) {
    return new ControlPlaneError(500, "internal_error", { message: error.message });
  }

  return new ControlPlaneError(500, "internal_error", { error });
}
