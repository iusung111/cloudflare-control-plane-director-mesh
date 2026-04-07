import { RuntimeStore } from "./store";
import {
  MissionEvent,
  Session,
  Lease,
  QueueItem,
  ResourceScope,
  QueueType,
} from "./types";
import { encodeBase64, decodeBase64 } from "./encoding";
import {
  safeDedupPath,
  eventPath,
  sessionPath,
  leasePath,
  queuePath,
  queueDir,
} from "./github_path";
import { normalizeResourceScope } from "./resource_key";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  token: string;
  branch: string; // Made mandatory as per [A-4]
}

export class GitHubRuntimeStore implements RuntimeStore {
  constructor(private readonly config: GitHubStoreConfig) {
    if (!config.branch) {
      throw new Error("GitHubRuntimeStore: branch is required");
    }
  }

  async hasDedup(dedupKey: string): Promise<boolean> {
    const path = safeDedupPath(dedupKey);
    return this.fileExists(path);
  }

  async saveDedup(dedupKey: string, commandId: string): Promise<void> {
    const path = safeDedupPath(dedupKey);
    // [A-5] Store original dedupKey in the JSON content
    const content = JSON.stringify({
      dedupKey,
      commandId,
      createdAt: new Date().toISOString(),
    });
    await this.writeFile(path, content);
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
    const path = eventPath(event.eventId, new Date(event.createdAt));
    await this.writeFile(path, JSON.stringify(event, null, 2));
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const path = sessionPath(sessionId);
    const content = await this.readFile(path);
    return content ? JSON.parse(content) : null;
  }

  async getLease(leaseId: string): Promise<Lease | null> {
    const path = leasePath(leaseId);
    const content = await this.readFile(path);
    return content ? JSON.parse(content) : null;
  }

  async saveLease(lease: Lease): Promise<void> {
    const path = leasePath(lease.leaseId);
    await this.writeFile(path, JSON.stringify(lease, null, 2));
  }

  async list(queue: QueueType): Promise<QueueItem[]> {
    const dir = queueDir(queue);
    const files = await this.listDir(dir);
    const items: QueueItem[] = [];
    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) items.push(JSON.parse(content));
    }
    return items;
  }

  async enqueue(item: QueueItem): Promise<void> {
    const path = queuePath(item.queue, item.itemId);
    await this.writeFile(path, JSON.stringify(item, null, 2));
  }

  async dequeue(itemId: string): Promise<void> {
    const queues: QueueType[] = ["task", "review", "proposal", "conflict", "deploy"];
    for (const q of queues) {
      const path = queuePath(q, itemId);
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
    const data = (await res.json()) as { content: string };
    // [A-6] Using UTF-8 safe base64 decode
    return decodeBase64(data.content);
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const existing = await this.apiCall(path, "GET");
    let sha: string | undefined;
    if (existing.status === 200) {
      const data = (await existing.json()) as { sha: string };
      sha = data.sha;
    }

    const res = await this.apiCall(path, "PUT", {
      message: `Control Plane: update ${path}`,
      // [A-6] Using UTF-8 safe base64 encode
      content: encodeBase64(content),
      sha,
      branch: this.config.branch,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GitHub write failed for ${path}: ${res.status} ${res.statusText} - ${errorText}`);
    }
  }

  private async deleteFile(path: string): Promise<void> {
    const existing = await this.apiCall(path, "GET");
    if (existing.status !== 200) return;
    const data = (await existing.json()) as { sha: string };
    const sha = data.sha;

    await this.apiCall(path, "DELETE", {
      message: `Control Plane: delete ${path}`,
      sha,
      branch: this.config.branch,
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
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}${method === "GET" || method === "HEAD" ? "?ref=" + this.config.branch : ""}`;
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

  private sameResource(left: ResourceScope, right: ResourceScope): boolean {
    const nLeft = normalizeResourceScope(left);
    const nRight = normalizeResourceScope(right);
    return (
      nLeft.repo === nRight.repo &&
      nLeft.branch === nRight.branch &&
      nLeft.path === nRight.path
    );
  }
}
