import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { getBrowser, createAuditedPage } from "../src/lib/browser";
import { preparePageForCapture, extractDomDetails, captureFullPageStitchedScreenshot, injectVisualOverlays } from "../src/lib/scanner";
import { checkLinks } from "../src/lib/linkChecker";
import { getRecommendedTools } from "../src/lib/tools";
import { generateReportHtml } from "../src/lib/reportHtml";
import { generateReportPdf } from "../src/lib/reportPdf";
import { createReportZip } from "../src/lib/zipPackager";
import { ScanJob } from "../src/types/audit";

let server: http.Server;
let fixtureUrl: string;

beforeAll(async () => {
  const fixtureHtml = await fs.readFile(path.join(process.cwd(), "public/fixture/audit-test.html"), "utf-8");

  server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fixtureHtml);
  });

  await new Promise<void>((resolve) => {
    server.listen(3000, "127.0.0.1", () => {
      fixtureUrl = "http://127.0.0.1:3000/fixture/audit-test.html";
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("PageAudit E2E Audit Flow on Fixture Page", () => {
  it("scans local fixture page, extracts findings, checks links, and builds ZIP report", async () => {
    const browser = await getBrowser();
    const page = await createAuditedPage(browser);

    const response = await page.goto(fixtureUrl, { waitUntil: "networkidle" });
    expect(response?.ok()).toBe(true);

    const dimensions = await preparePageForCapture(page);
    const domDetails = await extractDomDetails(page);

    // 1. Verify missing H1 and skipped level detection
    const h1Count = domDetails.headings.filter((h) => h.level === 1).length;
    expect(h1Count).toBe(0);

    const missingH1Finding = domDetails.findings.find((f) => f.id === "heading-missing-h1");
    expect(missingH1Finding).toBeDefined();

    // 2. Verify missing alt detection
    const missingAltImg = domDetails.images.find((img) => img.status === "fail");
    expect(missingAltImg).toBeDefined();

    // 3. Verify screenshots
    const rawCapture = await captureFullPageStitchedScreenshot(page, dimensions);
    expect(rawCapture.buffer.length).toBeGreaterThan(100);

    await injectVisualOverlays(page, "all");
    const annotatedCapture = await captureFullPageStitchedScreenshot(page, dimensions);
    expect(annotatedCapture.buffer.length).toBeGreaterThan(100);

    // 4. Verify link checker & broken anchor detection
    const linkResults = await checkLinks(fixtureUrl, domDetails.rawLinks, domDetails.domIdsAndNames);
    const brokenAnchor = linkResults.links.find((l) => l.href === "#non-existent-section");
    expect(brokenAnchor?.status).toBe("fail");
    expect(brokenAnchor?.anchorExists).toBe(false);

    const validAnchor = linkResults.links.find((l) => l.href === "#section-images");
    expect(validAnchor?.status).toBe("pass");
    expect(validAnchor?.anchorExists).toBe(true);

    // 5. Verify ZIP package generation
    const mockJob: ScanJob = {
      jobId: "e2e-test-job-789",
      targetUrl: fixtureUrl,
      domain: "127.0.0.1",
      createdAt: new Date().toISOString(),
      status: "ready",
      progressPercent: 100,
      currentStage: "ready",
      stats: {
        totalHeadings: domDetails.headings.length,
        headingErrors: domDetails.findings.filter((f) => f.category === "headings").length,
        totalImages: domDetails.images.length,
        imagesMissingAlt: domDetails.images.filter((i) => i.status === "fail").length,
        imagesEmptyAlt: domDetails.images.filter((i) => i.status === "warning").length,
        totalLinks: linkResults.totalFound,
        passedLinks: linkResults.links.filter((l) => l.status === "pass").length,
        failedLinks: linkResults.links.filter((l) => l.status === "fail").length,
        unverifiableLinks: linkResults.links.filter((l) => l.status === "unverifiable").length,
        cappedLinks: false,
        durationMs: 1500,
      },
      findings: domDetails.findings,
      headings: domDetails.headings,
      images: domDetails.images,
      links: linkResults.links,
      tools: getRecommendedTools({
        totalHeadings: domDetails.headings.length,
        headingErrors: domDetails.findings.filter((f) => f.category === "headings").length,
        totalImages: domDetails.images.length,
        imagesMissingAlt: domDetails.images.filter((i) => i.status === "fail").length,
        imagesEmptyAlt: domDetails.images.filter((i) => i.status === "warning").length,
        totalLinks: linkResults.totalFound,
        passedLinks: linkResults.links.filter((l) => l.status === "pass").length,
        failedLinks: linkResults.links.filter((l) => l.status === "fail").length,
        unverifiableLinks: linkResults.links.filter((l) => l.status === "unverifiable").length,
        cappedLinks: false,
        durationMs: 1500,
      }, domDetails.findings),
    };

    const htmlString = generateReportHtml(mockJob);
    const pdfBuffer = await generateReportPdf(browser, mockJob, annotatedCapture.buffer);
    const zipBuffer = await createReportZip(mockJob, {
      pdfBuffer,
      htmlString,
      rawPngBuffer: rawCapture.buffer,
      annotatedPngBuffer: annotatedCapture.buffer,
    });

    expect(zipBuffer.length).toBeGreaterThan(1000);

    await browser.close();
  }, 40000);
});
