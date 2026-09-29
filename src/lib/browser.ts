import playwright, { Browser, Page } from "playwright-core";
import chromium from "@sparticuz/chromium";

export async function getBrowser(): Promise<Browser> {
  const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION;

  if (isServerless) {
    const executablePath = await chromium.executablePath();
    return await playwright.chromium.launch({
      args: chromium.args,
      executablePath,
      headless: typeof chromium.headless === "boolean" ? chromium.headless : true,
    });
  }

  // Fallback to local installed chromium/playwright if available,
  // or use sparticuz executablePath locally if downloaded
  try {
    return await playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });
  } catch {
    const executablePath = await chromium.executablePath();
    return await playwright.chromium.launch({
      args: chromium.args,
      executablePath,
      headless: typeof chromium.headless === "boolean" ? chromium.headless : true,
    });
  }
}

export async function createAuditedPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PageAudit/1.0",
    acceptDownloads: false, // Security: sandbox browser session (no file downloads)
  });

  // Block non-http/https navigations & permission prompts
  context.grantPermissions([]);

  const page = await context.newPage();

  page.on("dialog", (dialog) => dialog.dismiss());

  return page;
}
