import type { AlertStateRecord, ScopedApprovalRecord } from "../../../../packages/contracts/src";

export class ControlStateDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const approvalMatch = /^\/approvals\/([^/]+)$/.exec(url.pathname);
    const alertStateMatch = /^\/alert-states\/([^/]+)$/.exec(url.pathname);

    if (url.pathname === "/approvals" && request.method === "GET") {
      return json(await this.list<ScopedApprovalRecord>("approval:"));
    }
    if (approvalMatch && request.method === "PUT") {
      const approval = await request.json() as ScopedApprovalRecord;
      await this.state.storage.put(`approval:${approvalMatch[1]}`, approval);
      return json(approval, 201);
    }
    if (approvalMatch && request.method === "DELETE") {
      await this.state.storage.delete(`approval:${approvalMatch[1]}`);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/alert-states" && request.method === "GET") {
      return json(await this.list<AlertStateRecord>("alert:"));
    }
    if (alertStateMatch && request.method === "PUT") {
      const alertState = await request.json() as AlertStateRecord;
      await this.state.storage.put(`alert:${alertStateMatch[1]}`, alertState);
      return json(alertState, 201);
    }

    return new Response("ControlStateDurableObject", { status: 200 });
  }

  private async list<T>(prefix: string): Promise<T[]> {
    const values = await this.state.storage.list<T>({ prefix });
    return Array.from(values.values());
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
