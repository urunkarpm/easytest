import { describe, it, expect } from "vitest";
import { getRecommendedTools } from "../src/lib/tools";
import { generateReportHtml } from "../src/lib/reportHtml";
import { ScanJob, ScanStats, Finding } from "../src/types/audit";

describe("Report Tools & HTML Generator", () => {
  it("recommends tools tailored to scan findings", () => {
    const stats: ScanStats = {
      totalHeadings: 5,
      headingErrors: 1,
      totalImages: 10,
      imagesMissingAlt: 2,
      imagesEmptyAlt: 1,
      totalLinks: 20,
      passedLinks: 18,
      failedLinks: 2,
      unverifiableLinks: 0,
      cappedLinks: false,
      durationMs: 2500,
    };

    const findings: Finding[] = [
      {
        id: "heading-missing-h1",
        category: "headings",
        severity: "error",
        title: "Missing H1",
        message: "No H1 heading found",
      },
      {
        id: "images-missing-alt",
        category: "images",
        severity: "error",
        title: "Missing Alt",
        message: "2 images missing alt text",
      },
    ];

    const tools = getRecommendedTools(stats, findings);
    expect(tools.length).toBeGreaterThan(0);

    const w3cLink = tools.find((t) => t.name.includes("W3C Link Checker"));
    expect(w3cLink?.reason).toContain("Found 2 broken");
  });

  it("generates html report without throwing errors", () => {
    const mockJob: ScanJob = {
      jobId: "test-job-123",
      targetUrl: "https://example.com",
      domain: "example.com",
      createdAt: new Date().toISOString(),
      status: "ready",
      progressPercent: 100,
      currentStage: "ready",
      stats: {
        totalHeadings: 2,
        headingErrors: 0,
        totalImages: 1,
        imagesMissingAlt: 0,
        imagesEmptyAlt: 0,
        totalLinks: 5,
        passedLinks: 5,
        failedLinks: 0,
        unverifiableLinks: 0,
        cappedLinks: false,
        durationMs: 1200,
      },
      findings: [],
      headings: [],
      images: [],
      links: [],
      tools: [],
    };

    const html = generateReportHtml(mockJob);
    expect(html).toContain("PageAudit Full Scan Report");
    expect(html).toContain("example.com");
  });
});
