import { describe, it, expect } from "vitest";
import { saveJob, getJob, deleteJob, saveReportBlob, getReportBlobBuffer, deleteReportBlobs } from "../src/lib/storage";
import { ScanJob } from "../src/types/audit";

describe("Storage & Lifecycle Operations", () => {
  it("saves, retrieves, and deletes a scan job", async () => {
    const testJob: ScanJob = {
      jobId: "test-storage-job-123",
      targetUrl: "https://example.com",
      domain: "example.com",
      createdAt: new Date().toISOString(),
      status: "ready",
      progressPercent: 100,
      currentStage: "ready",
    };

    await saveJob(testJob);

    const fetched = await getJob("test-storage-job-123");
    expect(fetched).not.toBeNull();
    expect(fetched?.jobId).toBe("test-storage-job-123");

    await deleteJob("test-storage-job-123");
    const fetchedAfterDel = await getJob("test-storage-job-123");
    expect(fetchedAfterDel).toBeNull();
  });

  it("saves and retrieves fallback blob buffers", async () => {
    const jobId = "test-blob-job-456";
    const filename = "test.txt";
    const content = Buffer.from("Hello PageAudit Storage!");

    const url = await saveReportBlob(jobId, filename, content, "text/plain");
    expect(url).toContain(jobId);

    const retrieved = await getReportBlobBuffer(jobId, filename, url);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.toString()).toBe("Hello PageAudit Storage!");

    await deleteReportBlobs(jobId, [url]);
    const retrievedAfterDel = await getReportBlobBuffer(jobId, filename);
    expect(retrievedAfterDel).toBeNull();
  });
});
