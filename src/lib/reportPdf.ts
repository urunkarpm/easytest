import { Browser } from "playwright-core";
import { generateReportHtml } from "./reportHtml";
import { ScanJob } from "@/types/audit";

export async function generateReportPdf(
  browser: Browser,
  job: ScanJob,
  annotatedPngBuffer?: Buffer
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  const imageBase64Map = annotatedPngBuffer
    ? { annotated: annotatedPngBuffer.toString("base64") }
    : undefined;

  const htmlContent = generateReportHtml(job, imageBase64Map);

  await page.setContent(htmlContent, { waitUntil: "networkidle" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "15mm",
      bottom: "15mm",
      left: "15mm",
      right: "15mm",
    },
  });

  await page.close();
  return pdfBuffer;
}
