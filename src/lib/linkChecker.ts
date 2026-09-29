import { validateUrlForSsrf } from "./ssrf";
import { LinkResult, LinkStatus } from "@/types/audit";

interface RawLinkInput {
  href: string;
  text: string;
  box?: { x: number; y: number; width: number; height: number };
  isAnchor: boolean;
}

export interface LinkCheckerOptions {
  maxLinks?: number;
  concurrency?: number;
  timeoutMs?: number;
}

/**
 * Checks extracted links server-side with SSRF protection, HEAD->GET fallbacks,
 * redirect tracking (max 5), anchor validation against DOM IDs/names, and concurrency controls.
 */
export async function checkLinks(
  baseUrl: string,
  rawLinks: RawLinkInput[],
  domIdsAndNames: string[],
  options: LinkCheckerOptions = {}
): Promise<{ links: LinkResult[]; totalFound: number; capped: boolean }> {
  const maxLinks = options.maxLinks ?? 500;
  const concurrency = options.concurrency ?? 10;
  const timeoutMs = options.timeoutMs ?? 10000;

  const totalFound = rawLinks.length;
  const capped = totalFound > maxLinks;
  const targetLinks = rawLinks.slice(0, maxLinks);

  const domTargetsSet = new Set(domIdsAndNames);

  // Group occurrence boxes by resolved URL / href
  const linkGroups = new Map<string, RawLinkInput[]>();
  targetLinks.forEach((item) => {
    const list = linkGroups.get(item.href) || [];
    list.push(item);
    linkGroups.set(item.href, list);
  });

  const uniqueHrefs = Array.from(linkGroups.keys());
  const evaluatedMap = new Map<string, { status: LinkStatus; statusCode?: number; finalUrl?: string; redirectChain?: string[]; responseTimeMs?: number; anchorExists?: boolean; reason?: string }>();

  // Process unique URLs concurrently in batches
  for (let i = 0; i < uniqueHrefs.length; i += concurrency) {
    const batch = uniqueHrefs.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (href) => {
        const firstOccur = linkGroups.get(href)![0];
        const res = await checkSingleHref(baseUrl, href, firstOccur.isAnchor, domTargetsSet, timeoutMs);
        evaluatedMap.set(href, res);
      })
    );
  }

  // Map findings back to every link occurrence on page
  const results: LinkResult[] = targetLinks.map((item) => {
    let resolvedUrl = item.href;
    try {
      resolvedUrl = new URL(item.href, baseUrl).toString();
    } catch {
      // Keep original string if resolution fails
    }

    const evalRes = evaluatedMap.get(item.href) || {
      status: "fail",
      reason: "Link evaluation omitted",
    };

    return {
      url: resolvedUrl,
      href: item.href,
      text: item.text,
      status: evalRes.status,
      statusCode: evalRes.statusCode,
      finalUrl: evalRes.finalUrl,
      redirectChain: evalRes.redirectChain,
      responseTimeMs: evalRes.responseTimeMs,
      box: item.box,
      isAnchor: item.isAnchor,
      anchorExists: evalRes.anchorExists,
      reason: evalRes.reason,
    };
  });

  return {
    links: results,
    totalFound,
    capped,
  };
}

async function checkSingleHref(
  baseUrl: string,
  href: string,
  isAnchor: boolean,
  domTargetsSet: Set<string>,
  timeoutMs: number
): Promise<{
  status: LinkStatus;
  statusCode?: number;
  finalUrl?: string;
  redirectChain?: string[];
  responseTimeMs?: number;
  anchorExists?: boolean;
  reason?: string;
}> {
  // Ignore mailto:, tel:, javascript:
  if (/^(mailto:|tel:|javascript:|sms:|data:)/i.test(href.trim())) {
    return {
      status: "pass",
      reason: "Non-HTTP protocol scheme ignored",
    };
  }

  // Internal `#anchor` link check against page DOM IDs and names
  if (isAnchor || href.startsWith("#")) {
    const anchorId = href.replace(/^#/, "");
    if (!anchorId) {
      // `#` points to top of page
      return { status: "pass", anchorExists: true };
    }
    const exists = domTargetsSet.has(anchorId) || domTargetsSet.has(decodeURIComponent(anchorId));
    return {
      status: exists ? "pass" : "fail",
      anchorExists: exists,
      reason: exists ? undefined : `Anchor #${anchorId} does not match any element ID or name on the page`,
    };
  }

  // Resolve relative URL
  let targetUrl: string;
  try {
    targetUrl = new URL(href, baseUrl).toString();
  } catch {
    return {
      status: "fail",
      reason: `Malformed or unresolvable URL: ${href}`,
    };
  }

  // SSRF check on target URL
  const ssrfRes = await validateUrlForSsrf(targetUrl);
  if (!ssrfRes.safe) {
    return {
      status: "fail",
      reason: `Blocked by SSRF protection: ${ssrfRes.reason}`,
    };
  }

  // Perform server-side fetch with redirect tracking and fallback
  const startTime = Date.now();
  try {
    const fetchRes = await fetchWithRedirects(targetUrl, timeoutMs);
    const responseTimeMs = Date.now() - startTime;

    return {
      status: fetchRes.status,
      statusCode: fetchRes.statusCode,
      finalUrl: fetchRes.finalUrl,
      redirectChain: fetchRes.redirectChain,
      responseTimeMs,
      reason: fetchRes.reason,
    };
  } catch (err: any) {
    const responseTimeMs = Date.now() - startTime;
    return {
      status: "fail",
      responseTimeMs,
      reason: `Network/connection error: ${err.message || err}`,
    };
  }
}

interface FetchRedirectResult {
  status: LinkStatus;
  statusCode?: number;
  finalUrl: string;
  redirectChain: string[];
  reason?: string;
}

async function fetchWithRedirects(
  initialUrl: string,
  timeoutMs: number
): Promise<FetchRedirectResult> {
  const redirectChain: string[] = [];
  let currentUrl = initialUrl;
  let maxRedirects = 5;

  while (maxRedirects > 0) {
    // Re-verify SSRF on every redirect step
    const ssrfCheck = await validateUrlForSsrf(currentUrl);
    if (!ssrfCheck.safe) {
      return {
        status: "fail",
        finalUrl: currentUrl,
        redirectChain,
        reason: `Redirect target blocked by SSRF: ${ssrfCheck.reason}`,
      };
    }

    let response: Response | null = null;
    let methodUsed = "HEAD";

    // Attempt HEAD request first
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      response = await fetch(currentUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 PageAudit LinkChecker/1.0",
        },
        signal: controller.signal,
        redirect: "manual",
      });
      clearTimeout(timer);

      // Fall back to GET on 405 (Method Not Allowed), 403, or 501
      if ([405, 403, 501].includes(response.status)) {
        methodUsed = "GET";
        const getController = new AbortController();
        const getTimer = setTimeout(() => getController.abort(), timeoutMs);

        response = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 PageAudit LinkChecker/1.0",
          },
          signal: getController.signal,
          redirect: "manual",
        });
        clearTimeout(getTimer);
      }
    } catch (err: any) {
      // Retry once on network error with GET
      try {
        const getController = new AbortController();
        const getTimer = setTimeout(() => getController.abort(), timeoutMs);

        response = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 PageAudit LinkChecker/1.0",
          },
          signal: getController.signal,
          redirect: "manual",
        });
        clearTimeout(getTimer);
      } catch (retryErr: any) {
        return {
          status: "fail",
          finalUrl: currentUrl,
          redirectChain,
          reason: `Request failed (${retryErr.message || retryErr})`,
        };
      }
    }

    if (!response) {
      return {
        status: "fail",
        finalUrl: currentUrl,
        redirectChain,
        reason: "No response received",
      };
    }

    const statusCode = response.status;

    // Check for redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          status: "fail",
          statusCode,
          finalUrl: currentUrl,
          redirectChain,
          reason: "Redirect response missing Location header",
        };
      }

      redirectChain.push(currentUrl);
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = nextUrl;
      maxRedirects--;
      continue;
    }

    // Classify response
    if (statusCode >= 200 && statusCode < 300) {
      const isRedirected = redirectChain.length > 0;
      return {
        status: isRedirected ? "redirect" : "pass",
        statusCode,
        finalUrl: currentUrl,
        redirectChain,
      };
    } else if ([403, 429, 999].includes(statusCode)) {
      // Bot-blocked or rate-limited
      return {
        status: "unverifiable",
        statusCode,
        finalUrl: currentUrl,
        redirectChain,
        reason: `Server responded with ${statusCode} (bot protection or rate limit)`,
      };
    } else {
      // 4xx or 5xx failures
      return {
        status: "fail",
        statusCode,
        finalUrl: currentUrl,
        redirectChain,
        reason: `Server responded with HTTP ${statusCode}`,
      };
    }
  }

  return {
    status: "fail",
    finalUrl: currentUrl,
    redirectChain,
    reason: "Exceeded maximum redirect limit (5)",
  };
}
