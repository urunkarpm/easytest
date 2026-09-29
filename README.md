# PageAudit Web Application

**PageAudit** produces annotated full-page screenshots and downloadable ZIP findings packages for webpage accessibility and link quality inspections.

---

## Features

- **Full-Page Screenshot & Tiled Stitching**: Handles lazy-loaded media, sticky headers, font rendering, and tall pages up to 30,000px stitched via `sharp`.
- **Injected Visual Overlays**: Real-time DOM overlay injection for Heading levels H1–H6, Image Alt attribute completeness, and Link pass/fail/unverifiable status colors.
- **Server-Side Link Checker**: HEAD to GET fallback, concurrency 10, SSRF protection on redirects, broken anchor `#` validation against page DOM IDs/names.
- **Curated Recommended Tools**: Data-driven next steps recommending tools like axe-core, Lighthouse, W3C Link Checker, and Security Headers based on findings.
- **Single-Use Download & Auto-Delete**: ZIP packages are available for one download stream and auto-deleted immediately upon completion or after 30 minutes via Vercel Cron.

---

## Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Run unit and E2E test suite
npm test

# 3. Build for production
npm run build
```

---

## Environment Variables (.env.example)

```ini
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
KV_REST_API_URL="https://...upstash.io"
KV_REST_API_TOKEN="AXXX..."
CRON_SECRET="your-cron-secret-key"
```

*Note: For local development without Vercel Blob/KV credentials, PageAudit automatically falls back to an in-memory storage provider.*

---

## Vercel Deployment Steps

1. Push code to your Git repository.
2. Import repository into Vercel.
3. In Project Settings:
   - **Framework Preset**: Next.js
   - **Functions Max Duration**: Set up to plan limit (300 seconds)
   - **Functions Memory**: Set to `1024 MB` or higher
4. Attach a **Vercel Blob** store and **Upstash Redis / Vercel KV** integration.
5. Deploy.
