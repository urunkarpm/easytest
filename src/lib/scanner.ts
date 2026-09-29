import { Page } from "playwright-core";
import sharp from "sharp";
import { HeadingInfo, ImageInfo, BoundingBox, Finding } from "@/types/audit";

export interface DomExtractionResult {
  headings: HeadingInfo[];
  images: ImageInfo[];
  rawLinks: Array<{
    href: string;
    text: string;
    box?: BoundingBox;
    isAnchor: boolean;
  }>;
  domIdsAndNames: string[];
  findings: Finding[];
  pageTitle: string;
  pageHeight: number;
  pageWidth: number;
}

export interface ScreenshotPackage {
  rawPng: Buffer;
  annotatedPng: Buffer;
  headingsPng: Buffer;
  imagesPng: Buffer;
  linksPng: Buffer;
  truncated: boolean;
  originalHeight: number;
  capturedHeight: number;
}

/**
 * Scroll the page down in chunks to trigger lazy-loaded images,
 * then await web font loading, and scroll back to the top.
 */
export async function preparePageForCapture(page: Page): Promise<{ width: number; height: number }> {
  await page.evaluate(async () => {
    // Await fonts loading
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Auto-scroll down
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 30000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });

    // Brief sleep to allow any final CSS transitions / image loads
    await new Promise((r) => setTimeout(r, 500));
  });

  const dimensions = await page.evaluate(() => {
    return {
      width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0, 1440),
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.body.clientHeight,
        document.documentElement.clientHeight
      ),
    };
  });

  return dimensions;
}

/**
 * Extracts DOM details: headings, images, links, anchor targets, and initial accessibility findings.
 */
export async function extractDomDetails(page: Page): Promise<DomExtractionResult> {
  const result = await page.evaluate(() => {
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    const pageTitle = document.title || "Untitled Page";
    const pageWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0, 1440);
    const pageHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );

    // Collect DOM IDs and anchor names for anchor validation
    const domIdsAndNamesSet = new Set<string>();
    document.querySelectorAll("[id], [name]").forEach((el) => {
      const id = el.getAttribute("id");
      const name = el.getAttribute("name");
      if (id) domIdsAndNamesSet.add(id);
      if (name) domIdsAndNamesSet.add(name);
    });

    // 1. HEADINGS EXTRACTION
    const headingElements = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const headingsData: Array<{
      level: number;
      text: string;
      box: BoundingBox;
      issues: string[];
    }> = [];

    headingElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const level = parseInt(el.tagName.substring(1), 10);
      const text = (el.textContent || "").trim();
      const issues: string[] = [];

      if (!text) {
        issues.push("Empty heading text");
      }

      headingsData.push({
        level,
        text,
        box: {
          x: Math.round(rect.left + scrollX),
          y: Math.round(rect.top + scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        issues,
      });
    });

    // 2. IMAGES EXTRACTION
    const imageElements = Array.from(document.querySelectorAll("img, svg, [role='img']"));
    const imagesData: Array<{
      src: string;
      alt: string | null;
      hasAltAttr: boolean;
      accessibleName: string;
      isDecorative: boolean;
      isInsideInteractive: boolean;
      box: BoundingBox;
      status: "pass" | "warning" | "fail";
      issues: string[];
    }> = [];

    imageElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Skip invisible zero-size images
      if (rect.width === 0 && rect.height === 0) return;

      const tagName = el.tagName.toLowerCase();
      const hasAltAttr = el.hasAttribute("alt");
      const alt = el.getAttribute("alt");
      const src =
        el.getAttribute("src") ||
        el.getAttribute("data-src") ||
        (tagName === "svg" ? "Inline SVG" : "Image");

      // Check if inside interactive element (link/button)
      const parentInteractive = el.closest("a, button, [role='button']");
      const isInsideInteractive = !!parentInteractive;

      let accessibleName = "";
      if (tagName === "img") {
        accessibleName = alt || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      } else {
        accessibleName =
          el.getAttribute("aria-label") ||
          el.querySelector("title")?.textContent ||
          el.getAttribute("title") ||
          "";
      }

      accessibleName = accessibleName.trim();
      const isDecorative = hasAltAttr && alt === "";
      const issues: string[] = [];
      let status: "pass" | "warning" | "fail" = "pass";

      if (tagName === "img" && !hasAltAttr) {
        status = "fail";
        issues.push("Missing alt attribute");
      } else if (isInsideInteractive && !accessibleName && !parentInteractive?.textContent?.trim()) {
        status = "fail";
        issues.push("Image inside interactive element with no accessible name");
      } else if ((tagName === "svg" || el.getAttribute("role") === "img") && !accessibleName) {
        status = "fail";
        issues.push("SVG or role='img' missing title or aria-label");
      } else if (isDecorative) {
        status = "warning";
        issues.push("Empty alt attribute (decorative image)");
      }

      imagesData.push({
        src,
        alt,
        hasAltAttr,
        accessibleName,
        isDecorative,
        isInsideInteractive,
        box: {
          x: Math.round(rect.left + scrollX),
          y: Math.round(rect.top + scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        status,
        issues,
      });
    });

    // 3. LINKS EXTRACTION
    const linkElements = Array.from(document.querySelectorAll("a[href]"));
    const rawLinks: Array<{
      href: string;
      text: string;
      box?: BoundingBox;
      isAnchor: boolean;
    }> = [];

    linkElements.forEach((el) => {
      const href = el.getAttribute("href") || "";
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      const rect = el.getBoundingClientRect();
      const isAnchor = href.startsWith("#");

      rawLinks.push({
        href,
        text: text || href,
        isAnchor,
        box: {
          x: Math.round(rect.left + scrollX),
          y: Math.round(rect.top + scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    });

    return {
      headings: headingsData,
      images: imagesData,
      rawLinks,
      domIdsAndNames: Array.from(domIdsAndNamesSet),
      pageTitle,
      pageHeight,
      pageWidth,
    };
  });

  // Evaluate heading hierarchy findings
  const findings: Finding[] = [];
  const h1s = result.headings.filter((h) => h.level === 1);

  if (h1s.length === 0) {
    findings.push({
      id: "heading-missing-h1",
      category: "headings",
      severity: "error",
      title: "Missing <h1> Heading",
      message: "The page does not contain an <h1> heading. Pages should have one main <h1>.",
      recommendation: "Add a prominent <h1> element describing the main topic of the page.",
    });
  } else if (h1s.length > 1) {
    findings.push({
      id: "heading-multiple-h1",
      category: "headings",
      severity: "warning",
      title: "Multiple <h1> Headings",
      message: `Found ${h1s.length} <h1> headings. Multiple <h1> headings can disorient screen reader users.`,
      recommendation: "Consider using a single <h1> heading for the main page title.",
    });
  }

  // Check skipped heading levels
  let prevLevel = 0;
  result.headings.forEach((h, index) => {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      h.issues.push(`Skipped heading level from H${prevLevel} to H${h.level}`);
      findings.push({
        id: `heading-skipped-${index}`,
        category: "headings",
        severity: "warning",
        title: `Skipped Heading Level (H${prevLevel} → H${h.level})`,
        message: `Heading "${h.text.substring(0, 40)}" skips from H${prevLevel} to H${h.level}.`,
        elementSelector: `H${h.level}:contains("${h.text.substring(0, 20)}")`,
        box: h.box,
        recommendation: "Maintain a sequential heading hierarchy (e.g. H2 followed by H3).",
      });
    }
    prevLevel = h.level;
  });

  // Image findings
  const missingAlts = result.images.filter((img) => img.status === "fail");
  if (missingAlts.length > 0) {
    findings.push({
      id: "images-missing-alt",
      category: "images",
      severity: "error",
      title: `${missingAlts.length} Image(s) Missing Accessible Alternative`,
      message: "Found images without alt attributes or accessible names.",
      recommendation: "Provide clear, concise alt text describing the image content or mark as decorative with alt=\"\".",
    });
  }

  return {
    ...result,
    findings,
  };
}

/**
 * Inject overlay boxes for Headings, Images, Links, and Legend in the DOM prior to taking screenshots.
 * Mode: 'all' | 'headings' | 'images' | 'links'
 */
export async function injectVisualOverlays(
  page: Page,
  mode: "all" | "headings" | "images" | "links",
  linkResultsMap?: Map<string, { status: string; reason?: string }>
): Promise<void> {
  await page.evaluate(
    ({ mode, linkResultsMapObj }) => {
      // Remove previous overlay container if present
      const existing = document.getElementById("pageaudit-overlay-container");
      if (existing) existing.remove();

      const container = document.createElement("div");
      container.id = "pageaudit-overlay-container";
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "100%";
      container.style.height = `${document.documentElement.scrollHeight}px`;
      container.style.pointerEvents = "none";
      container.style.zIndex = "2147483647"; // Maximum z-index
      container.style.fontFamily = "system-ui, -apple-system, sans-serif";

      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;

      // 1. HEADINGS OVERLAYS
      if (mode === "all" || mode === "headings") {
        const headingColors: Record<number, string> = {
          1: "#8B5CF6", // Purple
          2: "#3B82F6", // Blue
          3: "#06B6D4", // Cyan
          4: "#10B981", // Emerald
          5: "#F59E0B", // Amber
          6: "#EC4899", // Pink
        };

        const headingEls = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
        headingEls.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const level = parseInt(el.tagName.substring(1), 10);
          const color = headingColors[level] || "#8B5CF6";
          const text = (el.textContent || "").trim();
          const isEmpty = !text;

          const box = document.createElement("div");
          box.style.position = "absolute";
          box.style.left = `${rect.left + scrollX}px`;
          box.style.top = `${rect.top + scrollY}px`;
          box.style.width = `${rect.width}px`;
          box.style.height = `${rect.height}px`;
          box.style.border = `2px solid ${isEmpty ? "#EF4444" : color}`;
          box.style.backgroundColor = `${color}15`; // 15% opacity tint

          const badge = document.createElement("span");
          badge.textContent = `H${level}${isEmpty ? " [EMPTY]" : ""}`;
          badge.style.position = "absolute";
          badge.style.top = "-22px";
          badge.style.left = "0px";
          badge.style.backgroundColor = isEmpty ? "#EF4444" : color;
          badge.style.color = "#FFFFFF";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "bold";
          badge.style.padding = "2px 6px";
          badge.style.borderRadius = "3px";
          badge.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";

          box.appendChild(badge);
          container.appendChild(box);
        });
      }

      // 2. IMAGES OVERLAYS
      if (mode === "all" || mode === "images") {
        const imgEls = document.querySelectorAll("img, svg, [role='img']");
        imgEls.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const tagName = el.tagName.toLowerCase();
          const hasAltAttr = el.hasAttribute("alt");
          const alt = el.getAttribute("alt");
          const accessibleName =
            alt ||
            el.getAttribute("aria-label") ||
            el.querySelector("title")?.textContent ||
            el.getAttribute("title") ||
            "";

          let border = "#3B82F6"; // Blue = passing
          let label = "IMG: Alt OK";

          if (tagName === "img" && !hasAltAttr) {
            border = "#EF4444"; // Red = missing alt
            label = "IMG: Missing Alt";
          } else if (hasAltAttr && alt === "") {
            border = "#F59E0B"; // Amber = decorative empty alt
            label = "IMG: Decorative (alt=\"\")";
          } else if (!accessibleName.trim()) {
            border = "#EF4444";
            label = "IMG: No Accessible Name";
          }

          const box = document.createElement("div");
          box.style.position = "absolute";
          box.style.left = `${rect.left + scrollX}px`;
          box.style.top = `${rect.top + scrollY}px`;
          box.style.width = `${rect.width}px`;
          box.style.height = `${rect.height}px`;
          box.style.border = `2px dashed ${border}`;
          box.style.backgroundColor = `${border}15`;

          const badge = document.createElement("span");
          badge.textContent = label;
          badge.style.position = "absolute";
          badge.style.bottom = "-20px";
          badge.style.left = "0px";
          badge.style.backgroundColor = border;
          badge.style.color = "#FFFFFF";
          badge.style.fontSize = "10px";
          badge.style.fontWeight = "bold";
          badge.style.padding = "1px 5px";
          badge.style.borderRadius = "2px";

          box.appendChild(badge);
          container.appendChild(box);
        });
      }

      // 3. LINKS OVERLAYS
      if (mode === "all" || mode === "links") {
        const linkEls = document.querySelectorAll("a[href]");
        linkEls.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const href = el.getAttribute("href") || "";
          const linkData = linkResultsMapObj ? linkResultsMapObj[href] : undefined;

          let color = "#10B981"; // Green = pass
          let statusText = "PASS";

          if (linkData) {
            if (linkData.status === "fail") {
              color = "#EF4444"; // Red = fail
              statusText = "FAIL";
            } else if (linkData.status === "unverifiable") {
              color = "#F59E0B"; // Amber = unverifiable
              statusText = "UNVERIFIED";
            } else if (linkData.status === "redirect") {
              color = "#3B82F6"; // Blue = redirect
              statusText = "REDIRECT";
            }
          }

          const box = document.createElement("div");
          box.style.position = "absolute";
          box.style.left = `${rect.left + scrollX}px`;
          box.style.top = `${rect.top + scrollY}px`;
          box.style.width = `${rect.width}px`;
          box.style.height = `${rect.height}px`;
          box.style.border = `1px solid ${color}`;
          box.style.backgroundColor = `${color}10`;

          container.appendChild(box);
        });
      }

      // 4. FLOATING LEGEND (Top Right)
      const legend = document.createElement("div");
      legend.style.position = "fixed";
      legend.style.top = "16px";
      legend.style.right = "16px";
      legend.style.backgroundColor = "rgba(15, 23, 42, 0.92)";
      legend.style.color = "#F8FAFC";
      legend.style.padding = "12px 16px";
      legend.style.borderRadius = "8px";
      legend.style.fontSize = "12px";
      legend.style.lineHeight = "1.5";
      legend.style.zIndex = "2147483647";
      legend.style.border = "1px solid rgba(255,255,255,0.15)";
      legend.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
      legend.style.backdropFilter = "blur(8px)";

      legend.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px; color: #38BDF8; border-bottom: 1px solid #334155; padding-bottom: 4px;">
          PageAudit Findings Legend (${mode.toUpperCase()})
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center;">
          <span style="display:inline-block; width:10px; height:10px; background:#8B5CF6; border-radius:2px;"></span> <span>Headings (H1-H6)</span>
          <span style="display:inline-block; width:10px; height:10px; background:#3B82F6; border-radius:2px;"></span> <span>Image Alt OK / Redirect</span>
          <span style="display:inline-block; width:10px; height:10px; background:#F59E0B; border-radius:2px;"></span> <span>Decorative Alt / Unverifiable</span>
          <span style="display:inline-block; width:10px; height:10px; background:#EF4444; border-radius:2px;"></span> <span>Missing Alt / Link Fail / Empty Heading</span>
          <span style="display:inline-block; width:10px; height:10px; background:#10B981; border-radius:2px;"></span> <span>Link Passing</span>
        </div>
      `;

      container.appendChild(legend);
      document.body.appendChild(container);
    },
    { mode, linkResultsMapObj: linkResultsMap ? Object.fromEntries(linkResultsMap) : {} }
  );
}

/**
 * Remove visual overlays from the page.
 */
export async function removeVisualOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById("pageaudit-overlay-container");
    if (el) el.remove();
  });
}

/**
 * Capture full page screenshot in tiles if page exceeds Chromium height limits (~16384px),
 * and stitch them using sharp. Hard max height capped at 30,000px.
 */
export async function captureFullPageStitchedScreenshot(
  page: Page,
  dimensions: { width: number; height: number }
): Promise<{ buffer: Buffer; truncated: boolean; originalHeight: number; capturedHeight: number }> {
  const HARD_MAX_HEIGHT = 30000;
  const TILE_HEIGHT = 8000;

  const originalHeight = dimensions.height;
  const capturedHeight = Math.min(originalHeight, HARD_MAX_HEIGHT);
  const truncated = originalHeight > HARD_MAX_HEIGHT;

  // Handle sticky/fixed elements so they don't repeat in tiled screenshots
  await page.evaluate(() => {
    const fixedEls = Array.from(document.querySelectorAll("*")).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.position === "fixed" || style.position === "sticky";
    });

    fixedEls.forEach((el, i) => {
      (el as HTMLElement).dataset.originalPosition = (el as HTMLElement).style.position;
      (el as HTMLElement).style.position = "absolute";
    });
  });

  // If captured height fits within a single tile
  if (capturedHeight <= TILE_HEIGHT) {
    const pngBuffer = await page.screenshot({
      fullPage: true,
      type: "png",
    });

    // Restore fixed positioning
    await restoreStickyHeaders(page);

    return {
      buffer: pngBuffer,
      truncated,
      originalHeight,
      capturedHeight,
    };
  }

  // Tiled capturing
  const viewportWidth = 1440;
  const tilesBuffers: Buffer[] = [];
  let currentY = 0;

  while (currentY < capturedHeight) {
    const thisTileHeight = Math.min(TILE_HEIGHT, capturedHeight - currentY);
    await page.setViewportSize({ width: viewportWidth, height: thisTileHeight });
    await page.evaluate((y) => window.scrollTo(0, y), currentY);
    await page.waitForTimeout(100);

    const tileBuffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });
    tilesBuffers.push(tileBuffer);

    currentY += thisTileHeight;
  }

  // Reset viewport size and scroll to top
  await page.setViewportSize({ width: viewportWidth, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await restoreStickyHeaders(page);

  // Stitch tiles using sharp
  const compositeInputs = await Promise.all(
    tilesBuffers.map(async (buf, index) => {
      const topOffset = index * TILE_HEIGHT;
      return {
        input: buf,
        top: topOffset,
        left: 0,
      };
    })
  );

  const stitchedBuffer = await sharp({
    create: {
      width: viewportWidth,
      height: capturedHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  return {
    buffer: stitchedBuffer,
    truncated,
    originalHeight,
    capturedHeight,
  };
}

async function restoreStickyHeaders(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fixedEls = document.querySelectorAll("[data-original-position]");
    fixedEls.forEach((el) => {
      (el as HTMLElement).style.position = (el as HTMLElement).dataset.originalPosition || "";
      delete (el as HTMLElement).dataset.originalPosition;
    });
  });
}
