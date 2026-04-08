const RSA_PKCS1_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
const PRIVATE_KEY_HEADER = "-----BEGIN PRIVATE KEY-----";

export async function importRsaPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const normalized = privateKeyPem.trim();

  if (normalized.includes(RSA_PKCS1_HEADER)) {
    return importPkcs1PrivateKey(normalized);
  }

  if (normalized.includes(PRIVATE_KEY_HEADER)) {
    return importPkcs8PrivateKey(normalized);
  }

  throw new Error("unsupported_github_app_private_key_format");
}

async function importPkcs8PrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(decodePemBody(privateKeyPem)),
    rsaSigningAlgorithm(),
    false,
    ["sign"],
  );
}

async function importPkcs1PrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    parsePkcs1PrivateKey(decodePemBody(privateKeyPem)),
    rsaSigningAlgorithm(),
    false,
    ["sign"],
  );
}

function parsePkcs1PrivateKey(bytes: Uint8Array): JsonWebKey {
  const sequence = readElement({ bytes, offset: 0 }, 0x30);
  const reader = { bytes: sequence, offset: 0 };

  readInteger(reader);
  const modulus = trimInteger(readInteger(reader));
  const publicExponent = trimInteger(readInteger(reader));
  const privateExponent = trimInteger(readInteger(reader));
  const prime1 = trimInteger(readInteger(reader));
  const prime2 = trimInteger(readInteger(reader));
  const exponent1 = trimInteger(readInteger(reader));
  const exponent2 = trimInteger(readInteger(reader));
  const coefficient = trimInteger(readInteger(reader));

  return {
    kty: "RSA",
    alg: "RS256",
    key_ops: ["sign"],
    ext: false,
    n: encodeBase64Url(modulus),
    e: encodeBase64Url(publicExponent),
    d: encodeBase64Url(privateExponent),
    p: encodeBase64Url(prime1),
    q: encodeBase64Url(prime2),
    dp: encodeBase64Url(exponent1),
    dq: encodeBase64Url(exponent2),
    qi: encodeBase64Url(coefficient),
  };
}

function readInteger(reader: DerReader): Uint8Array {
  return readElement(reader, 0x02);
}

function readElement(reader: DerReader, tag: number): Uint8Array {
  const currentTag = reader.bytes[reader.offset];
  if (currentTag !== tag) {
    throw new Error(`unexpected_der_tag:${currentTag}:${tag}`);
  }

  reader.offset += 1;
  const length = readLength(reader);
  const start = reader.offset;
  const end = start + length;
  if (end > reader.bytes.length) {
    throw new Error("invalid_der_length");
  }

  reader.offset = end;
  return reader.bytes.slice(start, end);
}

function readLength(reader: DerReader): number {
  const first = reader.bytes[reader.offset];
  reader.offset += 1;

  if ((first & 0x80) === 0) {
    return first;
  }

  const byteCount = first & 0x7f;
  if (byteCount === 0 || byteCount > 4) {
    throw new Error("unsupported_der_length");
  }

  let value = 0;
  for (let index = 0; index < byteCount; index += 1) {
    value = (value << 8) | reader.bytes[reader.offset];
    reader.offset += 1;
  }

  return value;
}

function trimInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }

  return bytes.slice(start);
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

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function rsaSigningAlgorithm(): RsaHashedImportParams {
  return {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface DerReader {
  bytes: Uint8Array;
  offset: number;
}
