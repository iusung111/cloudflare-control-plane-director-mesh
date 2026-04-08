import { describe, expect, it, vi } from "vitest";
import { createGitHubAppJwt, GitHubAuthProvider } from "../packages/adapters/src/github/github-auth";
import { resolveGitHubStoreConfig, type WorkerEnv } from "../apps/worker/src/services";

const SAMPLE_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAp3hC7rVpd0R0JSmI0iGO6wI+1wA+rSw65MCal5Chko8fqfX7
wYOgJ9ZFhL4t7jonsZAdtL6U7y4CAdEX3wNStTeEfUF7lSanX6ZouOMa9drHyHbr
JLAYNxJeQDJIt1Ux7Jjx8RhVW9XXsH8NgxVShyoVhISoNGAvWooxTr5d0yEQlfBp
nHnNRbwC97u5R4IzA+3Yk0uF87G5gRYMr11x2ec3KPxF5xfugS2O83LrmbQgMckJ
ugRSQYEED2vAXu7OCjrC/D+NiFWNyceuHuskkLm7tRK7sM+sqG6N9Kq+1NbfC7VI
lscaGVGLCnmjeqxDJFYN1nXEIxUEz/95VXur1QIDAQABAoIBABOKUeOmHDUJMjTH
LgqNVYPbTQzAymS3Wp8n+qxro5vvrOX5EyknBrq54tOpwxSJtD72I1kxvDv/gMbI
fcIM57YdpmJdD809PN30E0JbZrZqvXveUEfaxNXhg/N2n+BwWt+8kCJYUKwN/VmV
LDTwJHiBSGXK0BDdwONjaNHDdDwhmQXOr/53EhdE7+6BVHoKmX9+2BrXlFnEPcXo
rhgW6BWffTbC5Wh7bxqVn/HVuonh9tOIpk3ZPPBSscz2QhDbUBZNXYG1EWUjWgcU
fiRg6qflQDDw0W3xiS4IjD9Ejo2mtYYV2lnjJCxppmCUU2Nnmp6EnP5WB/JoRmG1
UUBS7FMCgYEA1RtAXdmiX5lwQep1LMTdGWR/XxNAFznDTv7krlytVjnPcsv+q2wK
7sh6hjAZ3sWy9d7+xnqmjTdeAN6ASOA3OLaLQRYdiFI54b0IL+siH/rgYwpemplU
BRavYBnZl1K4YHSwmi+MyfIuShdSZohboUTlZ/IksIWzdMbUvsBH7FMCgYEAyS18
dSIfgSVSvRp34RGU9mDmbC+8c6FgtVOga49gtY+2zy9Z2grk1tsBra6kPAzzTGjY
5eCweQruIUV2THpExGG/deDB1ylC1IEqsWZfu/vPIff51amupgE0MRdvcaHvyXV/
9z49az7w2qrIspGs+BuabCfDQTVKdXMHT4ErwjcCgYB3WoDtTzPauRQfRtIDleqD
Cz8vH5f4qhhSCP5JDYzjSxN9pvTmS2fAHrZIq24Bz9YQUKl+vjjDxKu4buWIa1Ni
RxKtDFbT/8F9RaLtO5LsOFUuAyPDEHb3NqJYf4HXd7PeCdzTLih6/lGgm3lCBcLU
CsM1OXAFEYzVrXp/ry9ZEwKBgQCrkID9G5amen/vCS2G4YmZ+9VGGgeqzMs+mAzM
7b9Z1y/dzNHhozy5BpiN18vz8k9isF+Y219kOrAN68ERQ4x1ta6kBoMIzQVTWLxi
AZ5PIFXq8CE917E7nPc3jnbZ/3IQ6oWxAoE6frjEorT5pEZQaKnu5pIbgCj5tJld
chkxTQKBgFAVLjPSTJDgcWcgD2WeguGmp7celvETJNPph0zQ2XNJdD/a3Gvh3NBE
VdlwPX0LQh2UPvoiRUzmd0IzJin0lZ4IIq9B5UmL+DiyH9oaNSMG/WA+rWEuOjXO
VVvPJ4mL0wdEs2+dKMFJ+l7eOBMMmRYPCQxRhaig030LejDrN9G/
-----END RSA PRIVATE KEY-----`;

const SAMPLE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp3hC7rVpd0R0JSmI0iGO
6wI+1wA+rSw65MCal5Chko8fqfX7wYOgJ9ZFhL4t7jonsZAdtL6U7y4CAdEX3wNS
tTeEfUF7lSanX6ZouOMa9drHyHbrJLAYNxJeQDJIt1Ux7Jjx8RhVW9XXsH8NgxVS
hyoVhISoNGAvWooxTr5d0yEQlfBpnHnNRbwC97u5R4IzA+3Yk0uF87G5gRYMr11x
2ec3KPxF5xfugS2O83LrmbQgMckJugRSQYEED2vAXu7OCjrC/D+NiFWNyceuHusk
kLm7tRK7sM+sqG6N9Kq+1NbfC7VIlscaGVGLCnmjeqxDJFYN1nXEIxUEz/95VXur
1QIDAQAB
-----END PUBLIC KEY-----`;

describe("github app auth", () => {
  it("creates a JWT signed from an RSA private key PEM", async () => {
    const now = new Date("2026-04-09T00:00:00.000Z");
    const jwt = await createGitHubAppJwt({
      clientId: "Iv1.testclient",
      privateKey: SAMPLE_PRIVATE_KEY,
    }, now);

    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
    expect(encodedHeader).toBeTruthy();
    expect(encodedPayload).toBeTruthy();
    expect(encodedSignature).toBeTruthy();

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as {
      iss: string;
      iat: number;
      exp: number;
    };
    expect(payload.iss).toBe("Iv1.testclient");
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000) - 60);
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 600);

    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await importPublicKey(SAMPLE_PUBLIC_KEY),
      toArrayBuffer(decodeBase64UrlToBytes(encodedSignature)),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    expect(verified).toBe(true);
  });

  it("caches installation tokens until they are near expiry", async () => {
    const now = new Date("2026-04-09T00:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({
        token: "install-token-1",
        expires_at: "2026-04-09T01:00:00.000Z",
      }), { status: 201 }));
    const provider = new GitHubAuthProvider({
      kind: "app",
      clientId: "Iv1.testclient",
      installationId: "42",
      privateKey: SAMPLE_PRIVATE_KEY,
    }, {
      fetch: fetchMock,
      now: () => now,
    });

    await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer install-token-1");
    await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer install-token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/app/installations/42/access_tokens");
  });

  it("refreshes installation tokens when they are near expiry", async () => {
    let now = new Date("2026-04-09T00:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "install-token-1",
        expires_at: "2026-04-09T00:04:00.000Z",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "install-token-2",
        expires_at: "2026-04-09T01:00:00.000Z",
      }), { status: 201 }));
    const provider = new GitHubAuthProvider({
      kind: "app",
      appId: "123456",
      installationId: "42",
      privateKey: SAMPLE_PRIVATE_KEY,
    }, {
      fetch: fetchMock,
      now: () => now,
    });

    await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer install-token-1");
    now = new Date("2026-04-09T00:01:00.000Z");
    await expect(provider.getAuthorizationHeader()).resolves.toBe("Bearer install-token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prefers github app credentials over a static token when both are configured", () => {
    const config = resolveGitHubStoreConfig({
      GITHUB_OWNER: "iusung111",
      GITHUB_REPO: "cloudflare-control-plane-director-mesh",
      GITHUB_BRANCH: "master",
      GITHUB_TOKEN: "fallback-token",
      GITHUB_APP_CLIENT_ID: "Iv1.testclient",
      GITHUB_INSTALLATION_ID: "42",
      GITHUB_PRIVATE_KEY: SAMPLE_PRIVATE_KEY,
    } as WorkerEnv);

    expect(config).toEqual({
      owner: "iusung111",
      repo: "cloudflare-control-plane-director-mesh",
      branch: "master",
      auth: {
        kind: "app",
        appId: undefined,
        clientId: "Iv1.testclient",
        installationId: "42",
        privateKey: SAMPLE_PRIVATE_KEY,
      },
    });
  });

  it("falls back to static token config when app credentials are absent", () => {
    const config = resolveGitHubStoreConfig({
      GITHUB_OWNER: "iusung111",
      GITHUB_REPO: "cloudflare-control-plane-director-mesh",
      GITHUB_BRANCH: "master",
      GITHUB_TOKEN: "fine-grained-token",
    } as WorkerEnv);

    expect(config).toEqual({
      owner: "iusung111",
      repo: "cloudflare-control-plane-director-mesh",
      branch: "master",
      auth: {
        kind: "token",
        token: "fine-grained-token",
      },
    });
  });
});

async function importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    toArrayBuffer(decodePemBody(publicKeyPem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function decodePemBody(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlToBytes(value));
}

function decodeBase64UrlToBytes(value: string): Uint8Array {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
