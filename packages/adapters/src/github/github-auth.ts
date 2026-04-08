import { importRsaPrivateKey } from "./rsa-private-key";

const DEFAULT_REFRESH_SKEW_MS = 5 * 60_000;
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "cloudflare-control-plane-director-mesh";

export interface GitHubStaticTokenConfig {
  kind: "token";
  token: string;
}

export interface GitHubAppTokenConfig {
  kind: "app";
  installationId: string;
  privateKey: string;
  appId?: string;
  clientId?: string;
}

export type GitHubAuthConfig = GitHubStaticTokenConfig | GitHubAppTokenConfig;

export interface GitHubAuthProviderOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

export class GitHubAuthProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private cachedInstallationToken?: {
    authorizationHeader: string;
    expiresAtMs: number;
  };

  constructor(
    private readonly config: GitHubAuthConfig,
    options?: GitHubAuthProviderOptions,
  ) {
    this.fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
    this.now = options?.now ?? (() => new Date());
  }

  async getAuthorizationHeader(): Promise<string> {
    if (this.config.kind === "token") {
      return `token ${this.config.token}`;
    }

    const cached = this.cachedInstallationToken;
    const nowMs = this.now().getTime();
    if (cached && cached.expiresAtMs - DEFAULT_REFRESH_SKEW_MS > nowMs) {
      return cached.authorizationHeader;
    }

    const installationToken = await this.fetchInstallationToken();
    this.cachedInstallationToken = installationToken;
    return installationToken.authorizationHeader;
  }

  private async fetchInstallationToken(): Promise<{
    authorizationHeader: string;
    expiresAtMs: number;
  }> {
    if (this.config.kind !== "app") {
      throw new Error("github_app_credentials_required");
    }

    const config = this.config;
    const jwt = await createGitHubAppJwt(config, this.now());
    const response = await this.fetchImpl(
      `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "User-Agent": USER_AGENT,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`github_app_installation_token_failed:${response.status}`);
    }

    const payload = await response.json() as {
      token?: string;
      expires_at?: string;
    };

    if (!payload.token || !payload.expires_at) {
      throw new Error("github_app_installation_token_missing_fields");
    }

    return {
      authorizationHeader: `Bearer ${payload.token}`,
      expiresAtMs: Date.parse(payload.expires_at),
    };
  }
}

export async function createGitHubAppJwt(
  config: Pick<GitHubAppTokenConfig, "appId" | "clientId" | "privateKey">,
  now: Date,
): Promise<string> {
  const issuer = config.clientId?.trim() || config.appId?.trim();
  if (!issuer) {
    throw new Error("github_app_issuer_required");
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const issuedAtSeconds = nowSeconds - 60;
  const expiresAtSeconds = nowSeconds + 10 * 60;
  const header = encodeJsonBase64Url({
    alg: "RS256",
    typ: "JWT",
  });
  const payload = encodeJsonBase64Url({
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
    iss: issuer,
  });
  const signatureInput = `${header}.${payload}`;
  const key = await importRsaPrivateKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signatureInput),
  );

  return `${signatureInput}.${encodeBytesBase64Url(new Uint8Array(signature))}`;
}

function encodeJsonBase64Url(value: Record<string, string | number>): string {
  return encodeBytesBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
