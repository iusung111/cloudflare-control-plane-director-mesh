import { RuntimeStore, MissionEvent, Session, Lease, QueueItem, ResourceScope, QueueType } from "./types";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
}

export class GitHubRuntimeStore implements RuntimeStore {
  constructor(private readonly config: GitHubStoreConfig) {}

  async hasDedup(dedupKey: string): Promise<boolean> {
    const path = `.control-plane/dedup/${dedupKey}`;
    return this.fileExists(path);
  }

  async saveDedup(dedupKey: string, commandId: string): Promise<void> {
    const path = `.control-plane/dedup/${dedupKey}`;
    await this.writeFile(path, JSON.stringify({ commandId, createdAt: new Date().toISOString() }));
  }

  async hasActiveLock(resource: ResourceScope, exceptLeaseId?: string): Promise<boolean> {
    const leases = await this.listLeases();
    for (const lease of leases) {
      if (exceptLeaseId && lease.leaseId === exceptLeaseId) continue;
      if (lease.status === "active" && this.sameResource(lease.resource, resource)) {
        return true;
      }
    }
    return false;
  }

  async appendEvent(event: MissionEvent): Promise<void> {
    const path = `.control-plane/events/${this.getTodayPath()}/${event.eventId}.json`;
    await this.writeFile(path, JSON.stringify(event, null, 2));
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const path = `.control-plane/sessions/${sessionId}.json`;
    const content = await this.readFile(path);
    return content ? JSON.parse(content) : null;
  }

  async getLease(leaseId: string): Promise<Lease | null> {
    const path = `.control-plane/leases/${leaseId}.json`;
    const content = await this.readFile(path);
    return content ? JSON.parse(content) : null;
  }

  async saveLease(lease: Lease): Promise<void> {
    const path = `.control-plane/leases/${lease.leaseId}.json`;
    await this.writeFile(path, JSON.stringify(lease, null, 2));
  }

  async list(queue: QueueType): Promise<QueueItem[]> {
    const dir = `.control-plane/queues/${queue}`;
    const files = await this.listDir(dir);
    const items: QueueItem[] = [];
    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) items.push(JSON.parse(content));
    }
    return items;
  }

  async enqueue(item: QueueItem): Promise<void> {
    const path = `.control-plane/queues/${item.queue}/${item.itemId}.json`;
    await this.writeFile(path, JSON.stringify(item, null, 2));
  }

  async dequeue(itemId: string): Promise<void> {
    const queues: QueueType[] = ["task", "review", "proposal", "conflict", "deploy"];
    for (const q of queues) {
      const path = `.control-plane/queues/${q}/${itemId}.json`;
      if (await this.fileExists(path)) {
        await this.deleteFile(path);
        return;
      }
    }
  }

  // --- GitHub API Helpers ---
  private async fileExists(path: string): Promise<boolean> {
    const res = await this.apiCall(path, "HEAD");
    return res.status === 200;
  }

  private async readFile(path: string): Promise<string | null> {
    const res = await this.apiCall(path, "GET");
    if (res.status !== 200) return null;
    const data = await res.json();
    // Using globalThis.atob for Worker compatibility
    return globalThis.atob(data.content.replace(/\n/g, ''));
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const existing = await this.apiCall(path, "GET");
    let sha: string | undefined;
    if (existing.status === 200) {
      const data = await existing.json();
      sha = data.sha;
    }

    const res = await this.apiCall(path, "PUT", {
      message: `Control Plane: update ${path}`,
      content: globalThis.btoa(content),
      sha,
      branch: this.config.branch || "main",
    });

    if (!res.ok) throw new Error(`GitHub write failed: ${res.statusText}`);
  }

  private async deleteFile(path: string): Promise<void> {
    const existing = await this.apiCall(path, "GET");
    if (existing.status !== 200) return;
    const { sha } = await existing.json();

    await this.apiCall(path, "DELETE", {
      message: `Control Plane: delete ${path}`,
      sha,
      branch: this.config.branch || "main",
    });
  }

  private async listDir(path: string): Promise<{ name: string; path: string }[]> {
    const res = await this.apiCall(path, "GET");
    if (res.status !== 200) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({ name: item.name, path: item.path }));
  }

  private async apiCall(path: string, method: string, body?: any): Promise<Response> {
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}${method === "GET" || method === "HEAD" ? "?ref=" + (this.config.branch || "main") : ""}`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.config.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Cloudflare-Control-Plane",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async listLeases(): Promise<Lease[]> {
    const files = await this.listDir(".control-plane/leases");
    const leases: Lease[] = [];
    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) leases.push(JSON.parse(content));
    }
    return leases;
  }

  private getTodayPath(): string {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  }

  private sameResource(left: ResourceScope, right: ResourceScope): boolean {
    return left.repo === right.repo && (left.branch ?? "") === (right.branch ?? "") && (left.path ?? "") === (right.path ?? "");
  }
}
