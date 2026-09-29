import { put, del } from "@vercel/blob";
import { kv } from "@vercel/kv";
import fs from "node:fs/promises";
import path from "node:path";
import { ScanJob } from "@/types/audit";

const JOB_TTL_SECONDS = 1800; // 30 minutes TTL

// In-memory / Filesystem store for local fallback
const memoryJobs = new Map<string, ScanJob>();
const memoryBlobs = new Map<string, Buffer>();

export async function saveJob(job: ScanJob): Promise<void> {
  const hasKv = !!process.env.KV_REST_API_URL;

  if (hasKv) {
    try {
      await kv.set(`job:${job.jobId}`, job, { ex: JOB_TTL_SECONDS });
      return;
    } catch (e) {
      console.warn("KV set failed, falling back to local memory store:", e);
    }
  }

  memoryJobs.set(job.jobId, { ...job });
}

export async function getJob(jobId: string): Promise<ScanJob | null> {
  const hasKv = !!process.env.KV_REST_API_URL;

  if (hasKv) {
    try {
      const job = await kv.get<ScanJob>(`job:${jobId}`);
      if (job) return job;
    } catch (e) {
      console.warn("KV get failed, falling back to memory store:", e);
    }
  }

  return memoryJobs.get(jobId) || null;
}

export async function deleteJob(jobId: string): Promise<void> {
  const hasKv = !!process.env.KV_REST_API_URL;

  if (hasKv) {
    try {
      await kv.del(`job:${jobId}`);
    } catch (e) {
      console.warn("KV del failed:", e);
    }
  }

  memoryJobs.delete(jobId);
}

export async function saveReportBlob(
  jobId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (hasBlob) {
    try {
      const blobPath = `reports/${jobId}/${filename}`;
      const blob = await put(blobPath, buffer, {
        access: "public",
        contentType,
      });
      return blob.url;
    } catch (e) {
      console.warn("Vercel Blob put failed, falling back to local storage:", e);
    }
  }

  // Fallback local memory/file storage
  const key = `${jobId}:${filename}`;
  memoryBlobs.set(key, buffer);
  return `/api/blob-fallback/${jobId}/${filename}`;
}

export async function getReportBlobBuffer(
  jobId: string,
  filename: string,
  blobUrl?: string
): Promise<Buffer | null> {
  const key = `${jobId}:${filename}`;
  if (memoryBlobs.has(key)) {
    return memoryBlobs.get(key)!;
  }

  if (blobUrl) {
    try {
      const res = await fetch(blobUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (e) {
      console.error("Failed to fetch blob from URL:", e);
    }
  }

  return null;
}

export async function deleteReportBlobs(jobId: string, urlsToDelete: string[]): Promise<void> {
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (hasBlob && urlsToDelete.length > 0) {
    try {
      const realUrls = urlsToDelete.filter((u) => u.startsWith("http"));
      if (realUrls.length > 0) {
        await del(realUrls);
      }
    } catch (e) {
      console.warn("Vercel Blob delete failed:", e);
    }
  }

  // Clear memory blobs for this job
  for (const key of Array.from(memoryBlobs.keys())) {
    if (key.startsWith(`${jobId}:`)) {
      memoryBlobs.delete(key);
    }
  }
}

export async function listAllJobs(): Promise<ScanJob[]> {
  const hasKv = !!process.env.KV_REST_API_URL;

  if (hasKv) {
    try {
      const keys = await kv.keys("job:*");
      if (keys.length > 0) {
        const jobs = await Promise.all(keys.map((k) => kv.get<ScanJob>(k)));
        return jobs.filter((j): j is ScanJob => j !== null);
      }
    } catch (e) {
      console.warn("KV list failed:", e);
    }
  }

  return Array.from(memoryJobs.values());
}
