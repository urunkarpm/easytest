import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/storage";

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
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  return NextResponse.json(job);
}
