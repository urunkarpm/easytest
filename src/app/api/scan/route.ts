import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { validateUrlForSsrf } from "@/lib/ssrf";
import { checkRateLimit, incrementRateLimit, clearActiveScan } from "@/lib/rateLimit";
import { saveJob, getJob, deleteJob, saveReportBlob, deleteReportBlobs } from "@/lib/storage";
import { getBrowser, createAuditedPage } from "@/lib/browser";
import { preparePageForCapture, extractDomDetails, injectVisualOverlays, captureFullPageStitchedScreenshot } from "@/lib/scanner";
import { checkLinks } from "@/lib/linkChecker";
import { getRecommendedTools } from "@/lib/tools";
import { generateReportHtml } from "@/lib/reportHtml";
import { generateReportPdf } from "@/lib/reportPdf";
import { createReportZip } from "@/lib/zipPackager";
import { ScanJob, JobStatus } from "@/types/audit";

export const maxDuration = 300; // 5 minutes max duration for serverless scan execution

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

  try {
    const body = await req.json();
    const { url, previousJobId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
    }

    // SSRF Validation
    const ssrfResult = await validateUrlForSsrf(url);
    if (!ssrfResult.safe) {
      return NextResponse.json({ error: ssrfResult.reason }, { status: 400 });
    }

    // Rate limiting check
    const rateCheck = await checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    // Delete previous session report if provided
    if (previousJobId && typeof previousJobId === "string") {
      try {
        const prevJob = await getJob(previousJobId);
        if (prevJob) {
          const urlsToDelete: string[] = [];
          if (prevJob.reportUrls) {
            Object.values(prevJob.reportUrls).forEach((u) => {
              if (u) urlsToDelete.push(u);
            });
          }
          await deleteReportBlobs(previousJobId, urlsToDelete);
          await deleteJob(previousJobId);
        }
      } catch (e) {
        console.warn("Failed to delete previous job:", e);
      }
    }

    // Generate signed, unguessable 128-bit jobId (32 hex chars)
    const jobId = crypto.randomBytes(16).toString("hex");
    const parsedUrl = new URL(ssrfResult.url || url);
    const domain = parsedUrl.hostname;

    const initialJob: ScanJob = {
      jobId,
      targetUrl: parsedUrl.toString(),
      domain,
      createdAt: new Date().toISOString(),
      status: "queued",
      progressPercent: 5,
      currentStage: "Scan queued",
    };

    await saveJob(initialJob);
    await incrementRateLimit(ip);

    // Run the full scan pipeline asynchronously
    runScanPipeline(ip, jobId, parsedUrl.toString(), domain).catch((err) => {
      console.error(`Pipeline error for job ${jobId}:`, err);
    });

    return NextResponse.json({ jobId, status: "queued" });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Internal server error: ${error.message || error}` },
      { status: 500 }
    );
  }
}

async function runScanPipeline(ip: string, jobId: string, targetUrl: string, domain: string) {
  const startTime = Date.now();
  let job = (await getJob(jobId)) || {
    jobId,
    targetUrl,
    domain,
    createdAt: new Date().toISOString(),
    status: "queued" as JobStatus,
    progressPercent: 5,
    currentStage: "Queued",
  };

  const updateStage = async (status: JobStatus, progressPercent: number, currentStage: string) => {
    job = {
      ...job,
      status,
      progressPercent,
      currentStage,
    };
    await saveJob(job);
  };

  let browser;
  try {
    // 1. Loading Page
    await updateStage("loading_page", 15, "Launching headless browser & navigating");
    browser = await getBrowser();
    const page = await createAuditedPage(browser);

    const response = await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      const statusCode = response ? response.status() : "No response";
      throw new Error(`Failed to load target page (HTTP ${statusCode})`);
    }

    // Prepare page (auto-scroll lazy content, await fonts)
    await updateStage("loading_page", 30, "Auto-scrolling page & awaiting lazy media/fonts");
    const dimensions = await preparePageForCapture(page);

    // 2. DOM Extraction
    await updateStage("screenshot", 45, "Extracting DOM details & analyzing accessibility");
    const domDetails = await extractDomDetails(page);

    // 3. Screenshots (Raw, Annotated, Headings, Images, Links)
    await updateStage("screenshot", 55, "Capturing full-page screenshots & rendering visual overlays");

    // Raw screenshot
    const rawCapture = await captureFullPageStitchedScreenshot(page, dimensions);

    // Combined Annotated screenshot
    await injectVisualOverlays(page, "all");
    const annotatedCapture = await captureFullPageStitchedScreenshot(page, dimensions);

    // Headings only
    await injectVisualOverlays(page, "headings");
    const headingsCapture = await captureFullPageStitchedScreenshot(page, dimensions);

    // Images only
    await injectVisualOverlays(page, "images");
    const imagesCapture = await captureFullPageStitchedScreenshot(page, dimensions);

    // 4. Checking Links Server-Side
    await updateStage("checking_links", 70, "Validating external & internal link targets");
    const linkResults = await checkLinks(targetUrl, domDetails.rawLinks, domDetails.domIdsAndNames);

    // Links only screenshot with evaluated status colors
    const linkStatusMap = new Map<string, { status: string; reason?: string }>();
    linkResults.links.forEach((l) => linkStatusMap.set(l.href, { status: l.status, reason: l.reason }));

    await injectVisualOverlays(page, "links", linkStatusMap);
    const linksCapture = await captureFullPageStitchedScreenshot(page, dimensions);

    // Calculate scan stats
    const durationMs = Date.now() - startTime;
    const stats = {
      totalHeadings: domDetails.headings.length,
      headingErrors: domDetails.findings.filter((f) => f.category === "headings").length,
      totalImages: domDetails.images.length,
      imagesMissingAlt: domDetails.images.filter((i) => i.status === "fail").length,
      imagesEmptyAlt: domDetails.images.filter((i) => i.status === "warning").length,
      totalLinks: linkResults.totalFound,
      passedLinks: linkResults.links.filter((l) => l.status === "pass").length,
      failedLinks: linkResults.links.filter((l) => l.status === "fail").length,
      unverifiableLinks: linkResults.links.filter((l) => l.status === "unverifiable").length,
      cappedLinks: linkResults.capped,
      durationMs,
    };

    const tools = getRecommendedTools(stats, domDetails.findings);

    job = {
      ...job,
      stats,
      findings: domDetails.findings,
      headings: domDetails.headings,
      images: domDetails.images,
      links: linkResults.links,
      tools,
      truncatedPage: rawCapture.truncated,
      originalHeight: rawCapture.originalHeight,
      capturedHeight: rawCapture.capturedHeight,
    };

    // 5. Building Report & Packaging ZIP
    await updateStage("building_report", 85, "Generating PDF summary & assembling ZIP package");

    const htmlString = generateReportHtml(job, {
      annotated: annotatedCapture.buffer.toString("base64"),
    });

    const pdfBuffer = await generateReportPdf(browser, job, annotatedCapture.buffer);

    const zipBuffer = await createReportZip(job, {
      pdfBuffer,
      htmlString,
      rawPngBuffer: rawCapture.buffer,
      annotatedPngBuffer: annotatedCapture.buffer,
      headingsPngBuffer: headingsCapture.buffer,
      imagesPngBuffer: imagesCapture.buffer,
      linksPngBuffer: linksCapture.buffer,
    });

    // Save assets to blob storage
    const zipUrl = await saveReportBlob(jobId, `pageaudit-${domain}-${jobId}.zip`, zipBuffer, "application/zip");
    const rawPngUrl = await saveReportBlob(jobId, "screenshot-raw.png", rawCapture.buffer, "image/png");
    const annotatedPngUrl = await saveReportBlob(jobId, "screenshot-annotated.png", annotatedCapture.buffer, "image/png");
    const headingsPngUrl = await saveReportBlob(jobId, "screenshot-headings.png", headingsCapture.buffer, "image/png");
    const imagesPngUrl = await saveReportBlob(jobId, "screenshot-images.png", imagesCapture.buffer, "image/png");
    const linksPngUrl = await saveReportBlob(jobId, "screenshot-links.png", linksCapture.buffer, "image/png");

    job.reportUrls = {
      zipUrl,
      rawPngUrl,
      annotatedPngUrl,
      headingsPngUrl,
      imagesPngUrl,
      linksPngUrl,
    };

    await updateStage("ready", 100, "Audit completed successfully");
  } catch (err: any) {
    console.error(`Scan failed for job ${jobId}:`, err);
    job = {
      ...job,
      status: "failed",
      currentStage: "Failed",
      error: err.message || String(err),
    };
    await saveJob(job);
  } finally {
    if (browser) {
      await browser.close();
    }
    await clearActiveScan(ip);
  }
}
