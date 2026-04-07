/**
 * Path generation logic for GitHub-based Control Plane storage.
 */

export function safeDedupPath(dedupKey: string): string {
  // Use simple hash to make it safe for file systems/GitHub API
  // Using a quick DJB2 hash or similar if crypto is not available,
  // but in Worker environment we can use crypto.subtle if needed.
  // For simplicity and safety, encodeURIComponent + length limit could work,
  // but let's go with a simple hex representation of the key.
  
  const safe = encodeURIComponent(dedupKey).replace(/%/g, '');
  const hash = simpleHash(dedupKey);
  
  return `.control-plane/dedup/${hash}.json`;
}

export function eventPath(eventId: string, timestamp: Date = new Date()): string {
  const y = timestamp.getFullYear();
  const m = String(timestamp.getMonth() + 1).padStart(2, '0');
  const d = String(timestamp.getDate()).padStart(2, '0');
  
  return `.control-plane/events/${y}/${m}/${d}/${eventId}.json`;
}

export function sessionPath(sessionId: string): string {
  return `.control-plane/sessions/${sessionId}.json`;
}

export function leasePath(leaseId: string): string {
  return `.control-plane/leases/${leaseId}.json`;
}

export function queuePath(queue: string, itemId: string): string {
  return `.control-plane/queues/${queue}/${itemId}.json`;
}

export function queueDir(queue: string): string {
  return `.control-plane/queues/${queue}`;
}

/**
 * Simple non-cryptographic hash for filename safety.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
