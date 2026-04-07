import { RuntimeStore, MissionEvent, Session, Lease, QueueItem, ResourceScope } from "./store";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
}

export class GitHubRuntimeStore implements RuntimeStore {
  constructor(private readonly config: GitHubStoreConfig) {}

  async hasDedup(key: string): Promise<boolean> {
    // Check if event file exists in GitHub
    const path = `.control-plane/events/${this.getTodayPath()}/${key}.json`;
    return this.fileExists(path);
  }

  async hasConflict(key: string, resource: ResourceScope): Promise<boolean> {
    // Check if any active lease overlaps with this resource
    // For now, check if any lease file in .control-plane/leases/ is active and same resource
    const leases = await this.listLeases();
    for (const lease of leases) {
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

  async hasActiveLock(resource: ResourceScope, exceptLeaseId?: string): Promise<boolean> {
    const leases = await this.listLeases();
    for (const lease of leases) {
      if (exceptLeaseId && lease.leaseId === exceptLeaseId) {
        continue;
      }
      if (lease.status === "active" && this.sameResource(lease.resource, resource)) {
        return true;
      }
    }
    return false;
  }

  async saveLease(lease: Lease): Promise<void> {
    const path = `.control-plane/leases/${lease.leaseId}.json`;
    await this.writeFile(path, JSON.stringify(lease, null, 2));
  }

  async list(queue: string): Promise<QueueItem[]> {
    const dir = `.control-plane/queues/${queue}`;
    const files = await this.listDir(dir);
    const items: QueueItem[] = [];
    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) {
        items.push(JSON.parse(content));
      }
    }
    return items;
  }

  async enqueue(item: QueueItem): Promise<void> {
    const path = `.control-plane/queues/${item.queue}/${item.itemId}.json`;
    await this.writeFile(path, JSON.stringify(item, null, 2));
  }

  async dequeue(itemId: string): Promise<void> {
    // Need to find which queue it belongs to or use item metadata
    // For now, iterate all queues (expensive) or require itemId to encode queue
    // Simplified: assume itemId starts with queue name or we search
    const queues = await this.listDir(".control-plane/queues");
    for (const q of queues) {
      const path = `.control-plane/queues/${q.name}/${itemId}.json`;
      if (await this.fileExists(path)) {
        await this.deleteFile(path);
        return;
      }
    }
  }

  // --- GitHub API Helpers ---

  private async fileExists(path: string): Promise<boolean> {
    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || "main"}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return res.status === 200;
  }

  private async readFile(path: string): Promise<string | null> {
    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || "main"}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (res.status !== 200) return null;
    const data = await res.json();
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  private async writeFile(path: string, content: string): Promise<void> {
    // To update, we need the SHA if it exists
    const existing = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || "main"}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    let sha: string | undefined;
    if (existing.status === 200) {
      const data = await existing.json();
      sha = data.sha;
    }

    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message: `Control Plane: update ${path}`,
          content: Buffer.from(content).toString("base64"),
          sha,
          branch: this.config.branch || "main",
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to write to GitHub: ${res.statusText}`);
    }
  }

  private async deleteFile(path: string): Promise<void> {
    const existing = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || "main"}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (existing.status !== 200) return;
    const data = await existing.json();
    const sha = data.sha;

    await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message: `Control Plane: delete ${path}`,
          sha,
          branch: this.config.branch || "main",
        }),
      }
    );
  }

  private async listDir(path: string): Promise<{ name: string; path: string }[]> {
    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || "main"}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (res.status !== 200) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({ name: item.name, path: item.path }));
  }

  private async listLeases(): Promise<Lease[]> {
    const files = await this.listDir(".control-plane/leases");
    const leases: Lease[] = [];
    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) {
        leases.push(JSON.parse(content));
      }
    }
    return leases;
  }

  private getTodayPath(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  private sameResource(left: ResourceScope, right: ResourceScope): boolean {
    return (
      left.repo === right.repo &&
      (left.branch ?? "") === (right.branch ?? "") &&
      (left.path ?? "") === (right.path ?? "")
    );
  }
}
