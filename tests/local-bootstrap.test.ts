import { describe, expect, it } from "vitest";
import { createApp } from "../apps/worker/src/create-app";

describe("local bootstrap", () => {
  it("boots without github store configuration by falling back to memory storage", async () => {
    const app = createApp();
    const response = await app.request("/healthz");
    const body = await response.json() as { status: string; timestamp: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });

  it("keeps local fallback state across multiple requests", async () => {
    const app = createApp();

    const created = await app.request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess-local",
        actorId: "local-operator",
        role: "delivery",
      }),
    });
    expect(created.status).toBe(201);

    const listed = await app.request("/api/sessions");
    expect(listed.status).toBe(200);
    const sessions = await listed.json() as Array<{ sessionId: string }>;
    expect(sessions.some((session) => session.sessionId === "sess-local")).toBe(true);
  });
});
