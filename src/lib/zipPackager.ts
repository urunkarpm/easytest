import archiver from "archiver";
import { Writable } from "node:stream";
import { ScanJob, LinkResult, HeadingInfo, ImageInfo } from "@/types/audit";

export interface ZipAssets {
  pdfBuffer: Buffer;
  htmlString: string;
  rawPngBuffer: Buffer;
  annotatedPngBuffer: Buffer;
  headingsPngBuffer?: Buffer;
  imagesPngBuffer?: Buffer;
  linksPngBuffer?: Buffer;
}

export async function createReportZip(job: ScanJob, assets: ZipAssets): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    const bufferStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });

    bufferStream.on("finish", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(bufferStream);

    // 1. Add PDF & HTML reports
    archive.append(assets.pdfBuffer, { name: "report.pdf" });
    archive.append(assets.htmlString, { name: "report.html" });

    // 2. Add Screenshots
    archive.append(assets.rawPngBuffer, { name: "screenshot-raw.png" });
    archive.append(assets.annotatedPngBuffer, { name: "screenshot-annotated.png" });

    if (assets.headingsPngBuffer) {
      archive.append(assets.headingsPngBuffer, { name: "screenshot-headings.png" });
    }
    if (assets.imagesPngBuffer) {
      archive.append(assets.imagesPngBuffer, { name: "screenshot-images.png" });
    }
    if (assets.linksPngBuffer) {
      archive.append(assets.linksPngBuffer, { name: "screenshot-links.png" });
    }

    // 3. Add CSV Export Files
    archive.append(generateLinksCsv(job.links || []), { name: "links.csv" });
    archive.append(generateHeadingsCsv(job.headings || []), { name: "headings.csv" });
    archive.append(generateImagesCsv(job.images || []), { name: "images.csv" });

    // 4. Add Findings JSON
    const findingsJson = JSON.stringify(
      {
        jobId: job.jobId,
        targetUrl: job.targetUrl,
        createdAt: job.createdAt,
        stats: job.stats,
        findings: job.findings,
        tools: job.tools,
        headings: job.headings,
        images: job.images,
        links: job.links,
      },
      null,
      2
    );
    archive.append(findingsJson, { name: "findings.json" });

    // 5. Add README.txt
    archive.append(generateReadmeTxt(job), { name: "README.txt" });

    archive.finalize();
  });
}

function generateLinksCsv(links: LinkResult[]): string {
  const headers = ["Href", "Resolved URL", "Anchor Text", "Status", "Status Code", "Response Time (ms)", "Reason / Details"];
  const rows = links.map((l) => [
    escapeCsv(l.href),
    escapeCsv(l.url),
    escapeCsv(l.text),
    escapeCsv(l.status),
    l.statusCode ? String(l.statusCode) : "",
    l.responseTimeMs ? String(l.responseTimeMs) : "",
    escapeCsv(l.reason || ""),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function generateHeadingsCsv(headings: HeadingInfo[]): string {
  const headers = ["Level", "Text", "Issues"];
  const rows = headings.map((h) => [
    `H${h.level}`,
    escapeCsv(h.text),
    escapeCsv(h.issues.join("; ") || "OK"),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function generateImagesCsv(images: ImageInfo[]): string {
  const headers = ["Source", "Alt Attribute", "Has Alt Attr", "Accessible Name", "Status", "Issues"];
  const rows = images.map((img) => [
    escapeCsv(img.src),
    escapeCsv(img.alt ?? ""),
    img.hasAltAttr ? "true" : "false",
    escapeCsv(img.accessibleName),
    escapeCsv(img.status),
    escapeCsv(img.issues.join("; ") || "OK"),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function generateReadmeTxt(job: ScanJob): string {
  return `========================================================================
PageAudit Findings & Report Package
Target URL: ${job.targetUrl}
Generated At: ${new Date(job.createdAt).toUTCString()}
Job ID: ${job.jobId}
========================================================================

CONTENTS OF THIS ZIP PACKAGE:
------------------------------------------------------------------------
1. report.pdf           - Formal accessibility & link audit summary report
2. report.html          - Interactive HTML report
3. screenshot-raw.png   - Original unaltered full-page screenshot
4. screenshot-annotated.png - Full-page screenshot with injected visual overlays
5. screenshot-headings.png  - Category screenshot highlighting headings H1-H6
6. screenshot-images.png    - Category screenshot highlighting image alt attributes
7. screenshot-links.png     - Category screenshot highlighting link check statuses
8. links.csv            - Detailed CSV export of all checked URLs and status codes
9. headings.csv         - Detailed CSV export of heading hierarchy
10. images.csv          - Detailed CSV export of image alt text analysis
11. findings.json       - Raw machine-readable audit data
12. README.txt          - This file

COLOR LEGEND & ANNOTATIONS:
------------------------------------------------------------------------
- HEADINGS (Purple/Blue/Cyan/Emerald/Amber/Pink):
  Outlined boxes for H1-H6. Missing or empty headings are flagged in RED.

- IMAGES:
  - BLUE box   = Valid alt text or accessible name
  - AMBER box  = Decorative image (empty alt="")
  - RED box    = Missing alt attribute or missing accessible name

- LINKS:
  - GREEN box  = 2xx Passing HTTP status
  - BLUE box   = 3xx Redirect resolved
  - RED box    = 4xx/5xx Failed or broken link
  - AMBER box  = Unverifiable link (bot protection 403/429/999)

NOTICE:
------------------------------------------------------------------------
This audit package is available for a single download stream and will expire
30 minutes after generation.
`;
}

function escapeCsv(str: string): string {
  if (str == null) return '""';
  const escaped = String(str).replace(/"/g, '""');
  return `"${escaped}"`;
}
