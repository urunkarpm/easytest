import { NextRequest, NextResponse } from "next/server";
import { getJob, saveJob, deleteJob, getReportBlobBuffer, deleteReportBlobs } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "Report not found or has expired." },
      { status: 404 }
    );
  }

  // Single-use download check: 410 Gone if already downloaded
  if (job.isDownloaded) {
    return NextResponse.json(
      { error: "This report has already been downloaded and is no longer available (one-time download policy)." },
      { status: 410 }
    );
  }

  if (job.status !== "ready" || !job.reportUrls?.zipUrl) {
    return NextResponse.json(
      { error: "Report is not ready for download." },
      { status: 400 }
    );
  }

  const zipFilename = `pageaudit-${job.domain}-${jobId}.zip`;
  const zipBuffer = await getReportBlobBuffer(jobId, zipFilename, job.reportUrls.zipUrl);

  if (!zipBuffer) {
    return NextResponse.json(
      { error: "Failed to retrieve ZIP archive." },
      { status: 500 }
    );
  }

  // Mark job as downloaded and trigger immediate background deletion of blobs and job record
  job.isDownloaded = true;
  job.downloadedAt = new Date().toISOString();
  await saveJob(job);

  // Trigger deletion of blobs & job metadata after returning the stream
  const urlsToDelete: string[] = [];
  if (job.reportUrls) {
    Object.values(job.reportUrls).forEach((u) => {
      if (u) urlsToDelete.push(u);
    });
  }

  setTimeout(async () => {
    try {
      await deleteReportBlobs(jobId, urlsToDelete);
      await deleteJob(jobId);
    } catch (e) {
      console.error(`Post-download cleanup error for job ${jobId}:`, e);
    }
  }, 1000);

  // Stream ZIP file to client
  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="pageaudit-${job.domain}-${job.jobId}.zip"`,
      "Content-Length": String(zipBuffer.length),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
