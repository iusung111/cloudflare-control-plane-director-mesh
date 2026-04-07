import { describe, it, expect } from 'vitest';
import { encodeBase64, decodeBase64 } from '../encoding';

describe('Encoding Utility', () => {
  it('should handle ASCII roundtrip', () => {
    const input = "Hello World";
    const encoded = encodeBase64(input);
    const decoded = decodeBase64(encoded);
    expect(decoded).toBe(input);
  });

  it('should handle UTF-8 / Korean roundtrip', () => {
    const input = "안녕하세요. Hello! ";
    const encoded = encodeBase64(input);
    const decoded = decodeBase64(encoded);
    expect(decoded).toBe(input);
  });

  it('should handle JSON roundtrip', () => {
    const input = JSON.stringify({
      key: "value",
      nested: { num: 123, str: "" }
    });
    const encoded = encodeBase64(input);
    const decoded = decodeBase64(encoded);
    expect(decoded).toBe(input);
  });
});
