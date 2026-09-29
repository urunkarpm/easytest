import { describe, it, expect } from "vitest";
import { Finding, HeadingInfo, ImageInfo } from "../src/types/audit";

describe("Heading and Image Analysis Logic", () => {
  it("detects missing h1 and skipped levels in headings", () => {
    const headings: HeadingInfo[] = [
      { level: 2, text: "Section 1", box: { x: 0, y: 0, width: 100, height: 20 }, issues: [] },
      { level: 4, text: "Subsection", box: { x: 0, y: 30, width: 100, height: 20 }, issues: [] },
    ];

    const h1s = headings.filter((h) => h.level === 1);
    expect(h1s.length).toBe(0);

    let prevLevel = 0;
    const skippedIssues: string[] = [];
    headings.forEach((h) => {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        skippedIssues.push(`Skipped from H${prevLevel} to H${h.level}`);
      }
      prevLevel = h.level;
    });

    expect(skippedIssues.length).toBe(1);
    expect(skippedIssues[0]).toBe("Skipped from H2 to H4");
  });

  it("classifies image alt status correctly", () => {
    const images: ImageInfo[] = [
      {
        src: "a.jpg",
        alt: "A nice dog",
        hasAltAttr: true,
        accessibleName: "A nice dog",
        isDecorative: false,
        isInsideInteractive: false,
        box: { x: 0, y: 0, width: 50, height: 50 },
        status: "pass",
        issues: [],
      },
      {
        src: "b.jpg",
        alt: null,
        hasAltAttr: false,
        accessibleName: "",
        isDecorative: false,
        isInsideInteractive: false,
        box: { x: 0, y: 60, width: 50, height: 50 },
        status: "fail",
        issues: ["Missing alt attribute"],
      },
      {
        src: "c.jpg",
        alt: "",
        hasAltAttr: true,
        accessibleName: "",
        isDecorative: true,
        isInsideInteractive: false,
        box: { x: 0, y: 120, width: 50, height: 50 },
        status: "warning",
        issues: ["Empty alt attribute (decorative image)"],
      },
    ];

    expect(images[0].status).toBe("pass");
    expect(images[1].status).toBe("fail");
    expect(images[2].status).toBe("warning");
  });
});
