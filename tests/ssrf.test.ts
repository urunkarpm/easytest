import { describe, it, expect } from "vitest";
import { isPrivateIp, validateUrlForSsrf, UrlSchema } from "../src/lib/ssrf";

describe("SSRF Protection & URL Validation", () => {
  it("validates url schema correctly", () => {
    expect(UrlSchema.safeParse("https://example.com").success).toBe(true);
    expect(UrlSchema.safeParse("http://example.com/page?query=1").success).toBe(true);
    expect(UrlSchema.safeParse("ftp://example.com").success).toBe(false);
    expect(UrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
    expect(UrlSchema.safeParse("invalid-url").success).toBe(false);
  });

  it("identifies private IPv4 addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true); // Metadata IP
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false); // example.com
  });

  it("identifies private IPv6 addresses", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks localhost and private URLs in validateUrlForSsrf", async () => {
    const res1 = await validateUrlForSsrf("http://127.0.0.1");
    expect(res1.safe).toBe(false);

    const res2 = await validateUrlForSsrf("http://169.254.169.254/latest/meta-data/");
    expect(res2.safe).toBe(false);

    const res3 = await validateUrlForSsrf("http://192.168.0.1");
    expect(res3.safe).toBe(false);
  });

  it("allows valid public URLs", async () => {
    const res = await validateUrlForSsrf("https://example.com");
    expect(res.safe).toBe(true);
    expect(res.ip).toBeDefined();
  });
});
