import { kv } from "@vercel/kv";

interface RateLimitStore {
  counts: Map<string, { count: number; expiresAt: number }>;
  activeScans: Set<string>;
}

const memoryRateLimit: RateLimitStore = {
  counts: new Map(),
  activeScans: new Set(),
};

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; reason?: string }> {
  // 1. Check active scan concurrency (max 1 active scan per IP)
  if (memoryRateLimit.activeScans.has(ip)) {
    return {
      allowed: false,
      reason: "You already have a scan currently in progress. Please wait for it to complete.",
    };
  }

  // 2. Check Hourly Scan Limit (max 5 scans per hour per IP)
  const windowMs = 3600 * 1000;
  const maxScans = 5;
  const now = Date.now();

  const record = memoryRateLimit.counts.get(ip);
  if (record && record.expiresAt > now) {
    if (record.count >= maxScans) {
      const waitMinutes = Math.ceil((record.expiresAt - now) / 60000);
      return {
        allowed: false,
        reason: `Rate limit exceeded (max 5 scans per hour). Please try again in ${waitMinutes} minutes.`,
      };
    }
  }

  return { allowed: true };
}

export async function incrementRateLimit(ip: string): Promise<void> {
  const windowMs = 3600 * 1000;
  const now = Date.now();

  const record = memoryRateLimit.counts.get(ip);
  if (!record || record.expiresAt <= now) {
    memoryRateLimit.counts.set(ip, { count: 1, expiresAt: now + windowMs });
  } else {
    record.count += 1;
  }

  memoryRateLimit.activeScans.add(ip);
}

export async function clearActiveScan(ip: string): Promise<void> {
  memoryRateLimit.activeScans.delete(ip);
}
