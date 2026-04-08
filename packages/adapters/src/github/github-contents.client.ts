import { decodeBase64, encodeBase64 } from "./base64";
import { GitHubAuthProvider, type GitHubAuthConfig } from "./github-auth";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  branch: string;
  auth: GitHubAuthConfig;
}

export class GitHubContentsClient {
  private readonly authProvider: GitHubAuthProvider;

  constructor(private readonly config: GitHubStoreConfig) {
    if (!config.owner || !config.repo || !config.branch) {
      throw new Error("github_store_config_is_incomplete");
    }

    this.authProvider = new GitHubAuthProvider(config.auth);
  }

  async exists(path: string): Promise<boolean> {
    const response = await this.request(path, "HEAD");
    return response.status === 200;
  }

  async readJson<T>(path: string): Promise<T | null> {
    const response = await this.request(path, "GET");

    if (response.status !== 200) {
      return null;
    }

    const payload = await response.json() as { content: string };
    return JSON.parse(decodeBase64(payload.content)) as T;
  }

  async writeJson(path: string, value: unknown): Promise<void> {
    const existing = await this.request(path, "GET");
    const sha = existing.status === 200 ? (await existing.json() as { sha: string }).sha : undefined;
    const response = await this.request(path, "PUT", {
      message: `control-plane sync ${path}`,
      content: encodeBase64(JSON.stringify(value, null, 2)),
      sha,
      branch: this.config.branch,
    });

    if (!response.ok) {
      throw new Error(`github_write_failed:${path}:${response.status}`);
    }
  }

  async list(path: string): Promise<Array<{ name: string; path: string }>> {
    const response = await this.request(path, "GET");

    if (response.status !== 200) {
      return [];
    }

    const payload = await response.json();
    return Array.isArray(payload) ? payload.map(toEntry) : [];
  }

  private async request(path: string, method: string, body?: unknown): Promise<Response> {
    const ref = method === "GET" || method === "HEAD" ? `?ref=${this.config.branch}` : "";
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}${ref}`;
    const authorization = await this.authProvider.getAuthorizationHeader();
    return fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        Accept: "application/vnd.github+json",
        "User-Agent": "cloudflare-control-plane-director-mesh",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

function toEntry(value: unknown): { name: string; path: string } {
  const entry = value as { name: string; path: string };
  return { name: entry.name, path: entry.path };
}
