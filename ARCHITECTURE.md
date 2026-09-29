# PageAudit Architecture & Lifecycle Specification

## Overview
PageAudit is a serverless-compatible web application built with Next.js App Router that audits web pages for visual accessibility, heading structure, image alternative text, and link health.

---

## 1. Job Flow Diagram

```
[ User Input URL ]
        │
        ▼
[ POST /api/scan ] ───▶ (Validate URL / SSRF Check / Rate Limit)
        │
        ├─▶ Create Job Record (queued, status polling via GET /api/scan/[jobId])
        │
        ▼
[ Async Scan Execution ]
  ├─▶ 1. Launch @sparticuz/chromium via playwright-core
  ├─▶ 2. Load Page (waitUntil: networkidle, 30s cap)
  ├─▶ 3. Auto-scroll (trigger lazy images, await document.fonts.ready)
  ├─▶ 4. Extract DOM Details (Headings H1-H6, Image Alts, Anchor Targets, Link URLs)
  ├─▶ 5. Capture Full-Page Screenshots (Tiled stitching via sharp if height > 16k px)
  ├─▶ 6. Inject DOM Visual Overlays & Capture Category Screenshots (Headings, Images, Links)
  ├─▶ 7. Server-Side Link Checker (Concurrency 10, HEAD->GET fallback, SSRF check on redirects)
  ├─▶ 8. Generate Report Assets (PDF via page.pdf, HTML, CSVs, JSON, README)
  └─▶ 9. Package ZIP via Archiver & Upload to Vercel Blob / KV Store
```

---

## 2. Report Storage & Single-Use Download Lifecycle

```
                  ┌─────────────────────────────────────────┐
                  │ Scan Complete: ZIP stored in Blob/KV    │
                  └────────────────────┬────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
 [ User Clicks Download ]                               [ 30 Min Pass Without Download ]
            │                                                     │
 [ GET /api/download/[jobId] ]                                    ▼
            │                                           [ Vercel Cron Trigger ]
 ├─▶ Verify single-use flag                             [ GET /api/cron/cleanup ]
 ├─▶ Stream ZIP buffer to client                                  │
 └─▶ Immediately delete blobs & job record                        ▼
            │                                           Delete un-downloaded blobs
            ▼                                           & stale job metadata
 [ Subsequent Request -> 410 Gone ]
```

---

## 3. Storage Security & SSRF Protection

1. **SSRF Guard (`src/lib/ssrf.ts`)**:
   - Re-checks every target IP address against blocked IPv4 & IPv6 ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 IMDS metadata, ::1, fc00::/7).
   - Re-evaluated on every HTTP redirect during link checking.

2. **Browser Sandbox**:
   - Disables file downloads, blocks non-http/https protocol navigations, and auto-dismisses dialog prompts.

3. **Signed Unguessable Job IDs**:
   - Job IDs use 128-bit cryptographically secure random bytes (`crypto.randomBytes(16)`).
