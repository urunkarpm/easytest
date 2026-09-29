import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { z } from "zod";

export const UrlSchema = z.string().url().refine((val) => {
  try {
    const parsed = new URL(val);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, {
  message: "Only http and https protocols are allowed.",
});

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
  ip?: string;
  url?: string;
}

/**
 * Checks if an IP address string belongs to private/loopback/link-local/metadata ranges.
 */
export function isPrivateIp(ipString: string): boolean {
  try {
    const addr = ipaddr.parse(ipString);
    const range = addr.range();

    // Block private, loopback, linkLocal, uniqueLocal, reserved, carrierGradeNat, etc.
    const forbiddenRanges = [
      "private",
      "loopback",
      "linkLocal",
      "uniqueLocal",
      "reserved",
      "carrierGradeNat",
      "broadcast",
      "multicast"
    ];

    if (forbiddenRanges.includes(range)) {
      return true;
    }

    // AWS/GCP/Azure IMDS metadata IP (169.254.169.254)
    if (ipString === "169.254.169.254") {
      return true;
    }

    // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if (addr.kind() === "ipv6") {
      const ipv6 = addr as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        const ipv4 = ipv6.toIPv4Address();
        return isPrivateIp(ipv4.toString());
      }
    }

    return false;
  } catch {
    // If IP parsing fails, err on the side of safety
    return true;
  }
}

/**
 * Resolves the hostname in the URL and verifies that none of its resolved IP addresses are private.
 */
export async function validateUrlForSsrf(inputUrl: string): Promise<SsrfCheckResult> {
  const schemaResult = UrlSchema.safeParse(inputUrl);
  if (!schemaResult.success) {
    return {
      safe: false,
      reason: "Invalid URL format or unsupported protocol. Only http/https allowed.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { safe: false, reason: "Failed to parse URL." };
  }

  // Check port - allow standard 80, 443, and 8080/3000 for local test fixtures if explicitly allowed,
  // but block non-standard high ports or restricted service ports.
  const port = parsed.port;
  if (port && !["80", "443", "8080", "3000"].includes(port)) {
    return { safe: false, reason: `Port ${port} is not permitted.` };
  }

  const hostname = parsed.hostname;

  // Direct IP input check
  if (ipaddr.isValid(hostname)) {
    if (isPrivateIp(hostname)) {
      return {
        safe: false,
        reason: `Target IP ${hostname} is in a restricted/private network range.`,
        ip: hostname,
      };
    }
    return { safe: true, ip: hostname, url: parsed.toString() };
  }

  // DNS lookup
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { safe: false, reason: `Could not resolve hostname: ${hostname}` };
    }

    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          reason: `Hostname ${hostname} resolves to restricted IP ${record.address}.`,
          ip: record.address,
        };
      }
    }

    return {
      safe: true,
      ip: records[0].address,
      url: parsed.toString(),
    };
  } catch (error: any) {
    return {
      safe: false,
      reason: `DNS resolution failed for ${hostname}: ${error.message || error}`,
    };
  }
}
