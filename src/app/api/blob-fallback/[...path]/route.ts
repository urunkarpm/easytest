import { NextRequest, NextResponse } from "next/server";
import { getReportBlobBuffer } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: "Invalid blob path" }, { status: 400 });
  }

  const [jobId, filename] = pathSegments;
  const buffer = await getReportBlobBuffer(jobId, filename);

  if (!buffer) {
    return NextResponse.json({ error: "Blob asset not found" }, { status: 404 });
  }

  const isPng = filename.endsWith(".png");
  const contentType = isPng ? "image/png" : "application/zip";

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
