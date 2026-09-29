import { NextRequest, NextResponse } from "next/server";
import { listAllJobs, deleteJob, deleteReportBlobs } from "@/lib/storage";

export async function GET(req: NextRequest) {
  // Validate CRON_SECRET if configured
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron execution." }, { status: 401 });
  }

  try {
    const jobs = await listAllJobs();
    const now = Date.now();
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes threshold
    let deletedCount = 0;

    for (const job of jobs) {
      const createdAtMs = new Date(job.createdAt).getTime();
      const ageMs = now - createdAtMs;

      if (ageMs > maxAgeMs || job.status === "failed" || job.isDownloaded) {
        const urlsToDelete: string[] = [];
        if (job.reportUrls) {
          Object.values(job.reportUrls).forEach((u) => {
            if (u) urlsToDelete.push(u);
          });
        }
        await deleteReportBlobs(job.jobId, urlsToDelete);
        await deleteJob(job.jobId);
        deletedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      cleanedJobsCount: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Cron cleanup failed: ${error.message || error}` },
      { status: 500 }
    );
  }
}
