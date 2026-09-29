import { describe, it, expect } from "vitest";
import { checkLinks } from "../src/lib/linkChecker";

describe("Link Checker Logic & Anchor Validation", () => {
  it("ignores mailto, tel, and javascript links", async () => {
    const rawLinks = [
      { href: "mailto:support@example.com", text: "Email us", isAnchor: false },
      { href: "tel:+1234567890", text: "Call us", isAnchor: false },
      { href: "javascript:void(0)", text: "Click me", isAnchor: false },
    ];

    const result = await checkLinks("https://example.com", rawLinks, []);
    expect(result.links.length).toBe(3);
    result.links.forEach((l) => {
      expect(l.status).toBe("pass");
    });
  });

  it("validates internal anchor links against DOM IDs and names", async () => {
    const rawLinks = [
      { href: "#section-1", text: "Jump to 1", isAnchor: true },
      { href: "#missing-section", text: "Jump to missing", isAnchor: true },
      { href: "#top", text: "Top", isAnchor: true },
    ];

    const domIdsAndNames = ["section-1", "header", "footer"];

    const result = await checkLinks("https://example.com", rawLinks, domIdsAndNames);

    const link1 = result.links.find((l) => l.href === "#section-1");
    const link2 = result.links.find((l) => l.href === "#missing-section");

    expect(link1?.status).toBe("pass");
    expect(link1?.anchorExists).toBe(true);

    expect(link2?.status).toBe("fail");
    expect(link2?.anchorExists).toBe(false);
  });

  it("caps maximum processed links if total exceeds cap", async () => {
    const rawLinks = Array.from({ length: 15 }, (_, i) => ({
      href: `mailto:test${i}@example.com`,
      text: `Test ${i}`,
      isAnchor: false,
    }));

    const result = await checkLinks("https://example.com", rawLinks, [], { maxLinks: 10 });
    expect(result.totalFound).toBe(15);
    expect(result.capped).toBe(true);
    expect(result.links.length).toBe(10);
  });
});
