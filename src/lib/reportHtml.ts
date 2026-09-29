import { ScanJob } from "@/types/audit";

export function generateReportHtml(job: ScanJob, imageBase64Map?: { raw?: string; annotated?: string }): string {
  const stats = job.stats || {
    totalHeadings: 0,
    headingErrors: 0,
    totalImages: 0,
    imagesMissingAlt: 0,
    imagesEmptyAlt: 0,
    totalLinks: 0,
    passedLinks: 0,
    failedLinks: 0,
    unverifiableLinks: 0,
    cappedLinks: false,
    durationMs: 0,
  };

  const headings = job.headings || [];
  const images = job.images || [];
  const links = job.links || [];
  const findings = job.findings || [];
  const tools = job.tools || [];

  const dateStr = new Date(job.createdAt).toUTCString();

  const escapeHtml = (str: string) =>
    (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PageAudit Report - ${escapeHtml(job.domain)}</title>
  <style>
    :root {
      --primary: #0284c7;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --pass: #10b981;
      --warning: #f59e0b;
      --fail: #ef4444;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header-card {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 36px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      margin-bottom: 32px;
    }
    .header-card h1 {
      margin: 0 0 8px 0;
      font-size: 32px;
      color: #38bdf8;
    }
    .header-meta {
      font-size: 14px;
      color: #94a3b8;
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 16px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 36px;
    }
    .stat-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .stat-number {
      font-size: 28px;
      font-weight: 700;
      margin-top: 4px;
    }
    .stat-label {
      font-size: 13px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .text-pass { color: var(--pass); }
    .text-warning { color: var(--warning); }
    .text-fail { color: var(--fail); }

    .section {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 28px;
      margin-bottom: 32px;
    }
    .section h2 {
      margin-top: 0;
      font-size: 22px;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 12px;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background-color: #f8fafc;
      font-weight: 600;
      color: #475569;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-error { background-color: #fee2e2; color: #991b1b; }
    .badge-warning { background-color: #fef3c7; color: #92400e; }
    .badge-pass { background-color: #d1fae5; color: #065f46; }
    .badge-info { background-color: #e0f2fe; color: #075985; }

    .screenshot-box {
      margin-top: 20px;
      text-align: center;
    }
    .screenshot-box img {
      max-width: 100%;
      height: auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .tool-item {
      padding: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 12px;
      background-color: #fafafa;
    }
    .tool-item h3 {
      margin: 0 0 4px 0;
      font-size: 16px;
    }
    .tool-item p {
      margin: 4px 0;
      font-size: 14px;
      color: #475569;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <h1>PageAudit Full Scan Report</h1>
      <div>Target URL: <a href="${escapeHtml(job.targetUrl)}" target="_blank" style="color: #38bdf8;">${escapeHtml(job.targetUrl)}</a></div>
      <div class="header-meta">
        <span>Job ID: ${escapeHtml(job.jobId)}</span>
        <span>Date: ${dateStr}</span>
        <span>Tool Version: 1.0.0</span>
        <span>Scan Duration: ${(stats.durationMs / 1000).toFixed(2)}s</span>
      </div>
    </div>

    ${
      job.truncatedPage
        ? `<div style="background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; font-size: 14px;">
            <strong>Note:</strong> The target webpage height (${job.originalHeight}px) exceeded the hard threshold (30,000px). Screenshot and DOM capture were truncated to ${job.capturedHeight}px.
          </div>`
        : ""
    }

    <!-- Executive Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Headings</div>
        <div class="stat-number">${stats.totalHeadings}</div>
        <div style="font-size: 12px;" class="${stats.headingErrors > 0 ? "text-fail" : "text-pass"}">
          ${stats.headingErrors} Issue(s) Detected
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Images</div>
        <div class="stat-number">${stats.totalImages}</div>
        <div style="font-size: 12px;" class="${stats.imagesMissingAlt > 0 ? "text-fail" : "text-pass"}">
          ${stats.imagesMissingAlt} Missing Alt / ${stats.imagesEmptyAlt} Decorative
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Links Audited</div>
        <div class="stat-number">${stats.totalLinks} ${stats.cappedLinks ? "(Capped 500)" : ""}</div>
        <div style="font-size: 12px;">
          <span class="text-pass">${stats.passedLinks} Pass</span> |
          <span class="text-fail">${stats.failedLinks} Fail</span> |
          <span class="text-warning">${stats.unverifiableLinks} Unverified</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Findings</div>
        <div class="stat-number">${findings.length}</div>
        <div style="font-size: 12px;" class="${findings.length > 0 ? "text-warning" : "text-pass"}">
          ${findings.filter((f) => f.severity === "error").length} Critical Errors
        </div>
      </div>
    </div>

    <!-- Key Findings & Remediation -->
    <div class="section">
      <h2>Key Findings & Remediation Guidance</h2>
      ${
        findings.length === 0
          ? "<p class='text-pass'>No major accessibility or link structure violations were detected!</p>"
          : `<table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Category</th>
                  <th>Title / Message</th>
                  <th>Remediation</th>
                </tr>
              </thead>
              <tbody>
                ${findings
                  .map(
                    (f) => `
                  <tr>
                    <td><span class="badge badge-${f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "info"}">${f.severity}</span></td>
                    <td style="text-transform: capitalize;">${escapeHtml(f.category)}</td>
                    <td>
                      <strong>${escapeHtml(f.title)}</strong><br>
                      <span style="color: #64748b; font-size: 13px;">${escapeHtml(f.message)}</span>
                    </td>
                    <td style="font-size: 13px; color: #334155;">${escapeHtml(f.recommendation || "N/A")}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    </div>

    <!-- Annotated Screenshot Preview -->
    ${
      imageBase64Map?.annotated
        ? `<div class="section">
            <h2>Annotated Full-Page Screenshot Excerpt</h2>
            <div class="screenshot-box">
              <img src="data:image/png;base64,${imageBase64Map.annotated}" alt="Annotated Page Screenshot" />
            </div>
          </div>`
        : ""
    }

    <!-- Detailed Headings Breakdown -->
    <div class="section">
      <h2>Headings Analysis (${headings.length})</h2>
      ${
        headings.length === 0
          ? "<p>No headings (H1-H6) found on this page.</p>"
          : `<table>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Heading Text</th>
                  <th>Issues / Status</th>
                </tr>
              </thead>
              <tbody>
                ${headings
                  .map(
                    (h) => `
                  <tr>
                    <td><strong>H${h.level}</strong></td>
                    <td>${escapeHtml(h.text || "[EMPTY HEADING]")}</td>
                    <td>${
                      h.issues.length > 0
                        ? `<span class="badge badge-warning">${escapeHtml(h.issues.join(", "))}</span>`
                        : `<span class="badge badge-pass">OK</span>`
                    }</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    </div>

    <!-- Detailed Images Breakdown -->
    <div class="section">
      <h2>Images & Media Analysis (${images.length})</h2>
      ${
        images.length === 0
          ? "<p>No image elements found on this page.</p>"
          : `<table>
              <thead>
                <tr>
                  <th>Source / Alt</th>
                  <th>Accessible Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${images
                  .map(
                    (img) => `
                  <tr>
                    <td style="max-width: 300px; word-break: break-all;">
                      <strong>${escapeHtml(img.src)}</strong><br>
                      <small style="color: #64748b;">Alt: ${img.alt === null ? "<em>(None)</em>" : `"${escapeHtml(img.alt)}"`}</small>
                    </td>
                    <td>${escapeHtml(img.accessibleName || "-")}</td>
                    <td>
                      <span class="badge badge-${img.status === "fail" ? "error" : img.status === "warning" ? "warning" : "pass"}">
                        ${img.status.toUpperCase()}
                      </span>
                      ${img.issues.length > 0 ? `<div style="font-size:11px; color:#991b1b; margin-top:2px;">${escapeHtml(img.issues.join(", "))}</div>` : ""}
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    </div>

    <!-- Detailed Link Checking Results -->
    <div class="section">
      <h2>Link Checker Findings (${links.length})</h2>
      ${
        links.length === 0
          ? "<p>No links found on this page.</p>"
          : `<table>
              <thead>
                <tr>
                  <th>Link Text / Href</th>
                  <th>Status Code</th>
                  <th>Status</th>
                  <th>Details / Reason</th>
                </tr>
              </thead>
              <tbody>
                ${links
                  .map(
                    (l) => `
                  <tr>
                    <td style="max-width: 350px; word-break: break-all;">
                      <strong>${escapeHtml(l.text)}</strong><br>
                      <small style="color: #64748b;">${escapeHtml(l.href)}</small>
                    </td>
                    <td>${l.statusCode ? l.statusCode : "-"}</td>
                    <td>
                      <span class="badge badge-${l.status === "fail" ? "error" : l.status === "unverifiable" ? "warning" : l.status === "redirect" ? "info" : "pass"}">
                        ${l.status.toUpperCase()}
                      </span>
                    </td>
                    <td style="font-size: 12px; color: #475569;">
                      ${escapeHtml(l.reason || (l.finalUrl && l.finalUrl !== l.url ? `Resolved to: ${l.finalUrl}` : "OK"))}
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
      }
    </div>

    <!-- Tailored Recommended Tools -->
    <div class="section">
      <h2>Recommended Next Steps & Tools</h2>
      <p style="color: #64748b; font-size: 14px;">Curated suite of testing tools tailored to the findings on this webpage:</p>
      ${tools
        .map(
          (t) => `
        <div class="tool-item">
          <h3><a href="${escapeHtml(t.url)}" target="_blank" style="color: #0284c7; text-decoration: none;">${escapeHtml(t.name)}</a> <small style="color: #64748b; font-size: 12px;">(${escapeHtml(t.category)})</small></h3>
          <p>${escapeHtml(t.description)}</p>
          <p style="color: #0369a1; font-weight: 500; font-size: 13px; margin-top: 6px;">
            <strong>Why for this site:</strong> ${escapeHtml(t.reason)}
          </p>
        </div>`
        )
        .join("")}
    </div>

    <div class="footer">
      Generated by PageAudit Web Application &bull; Available for one download &bull; Expires in 30 minutes
    </div>
  </div>
</body>
</html>`;
}
