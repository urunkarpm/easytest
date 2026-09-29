import { ToolRecommendation, ScanStats, Finding } from "@/types/audit";

export interface ToolConfig {
  name: string;
  category: string;
  description: string;
  url: string;
  defaultReason: string;
  triggerCondition?: (stats: ScanStats, findings: Finding[]) => { recommended: boolean; reason?: string };
}

export const CATALOG_TOOLS: ToolConfig[] = [
  {
    name: "axe DevTools & axe-core",
    category: "Accessibility Testing",
    description: "Automated WCAG 2.1/2.2 accessibility engine for deep browser audits.",
    url: "https://www.deque.com/axe/",
    defaultReason: "Essential for detecting automated ARIA and contrast WCAG violations.",
    triggerCondition: (_stats, findings) => {
      const a11yErrors = findings.filter((f) => f.category === "headings" || f.category === "images");
      if (a11yErrors.length > 0) {
        return {
          recommended: true,
          reason: `Detected ${a11yErrors.length} accessibility finding(s). Use axe DevTools for deep WCAG compliance remediation.`,
        };
      }
      return { recommended: true };
    },
  },
  {
    name: "WAVE Web Accessibility Evaluation Tool",
    category: "Accessibility Visualizer",
    description: "Visual accessibility evaluator developed by WebAIM.",
    url: "https://wave.webaim.org/",
    defaultReason: "Provides an interactive in-browser visual summary of structural landmark and contrast errors.",
  },
  {
    name: "Lighthouse",
    category: "Performance & A11y",
    description: "Google's open-source automated tool for auditing performance, accessibility, SEO, and PWA.",
    url: "https://developer.chrome.com/docs/lighthouse/overview/",
    defaultReason: "Benchmarking core web vitals alongside automated accessibility scores.",
  },
  {
    name: "Pa11y",
    category: "CI/CD Automated A11y",
    description: "CLI and programmatic accessibility testing tool for continuous integration pipelines.",
    url: "https://pa11y.org/",
    defaultReason: "Automates accessibility checking in automated pull request and CI build pipelines.",
  },
  {
    name: "W3C Link Checker",
    category: "Link Quality",
    description: "Official W3C validator to inspect anchors and links across web documents.",
    url: "https://validator.w3.org/checklink",
    defaultReason: "Deep crawl of website links and redirects.",
    triggerCondition: (stats) => {
      if (stats.failedLinks > 0 || stats.unverifiableLinks > 0) {
        return {
          recommended: true,
          reason: `Found ${stats.failedLinks} broken and ${stats.unverifiableLinks} unverifiable link(s). Use W3C Link Checker for automated domain crawling.`,
        };
      }
      return { recommended: true };
    },
  },
  {
    name: "W3C Markup Validation Service",
    category: "HTML Quality",
    description: "Checks the markup validity of Web documents in HTML, XHTML, SMIL, MathML, etc.",
    url: "https://validator.w3.org/",
    defaultReason: "Ensures valid HTML structure and prevents DOM parsing inconsistencies.",
    triggerCondition: (_stats, findings) => {
      const headingIssues = findings.filter((f) => f.category === "headings");
      if (headingIssues.length > 0) {
        return {
          recommended: true,
          reason: `Found ${headingIssues.length} heading hierarchy issue(s). Validate HTML element nesting and document structure.`,
        };
      }
      return { recommended: true };
    },
  },
  {
    name: "Screaming Frog SEO Spider",
    category: "SEO & Site Crawler",
    description: "Advanced website crawler for technical SEO, broken link auditing, and redirect chain analysis.",
    url: "https://www.screamingfrog.co.uk/seo-spider/",
    defaultReason: "In-depth desktop crawling for large websites with thousands of URLs.",
  },
  {
    name: "Security Headers",
    category: "Security & Headers",
    description: "Analyzes HTTP response headers to evaluate CSP, HSTS, X-Frame-Options, and security posture.",
    url: "https://securityheaders.com/",
    defaultReason: "Ensures CSP, HSTS, and referrer security headers are configured.",
  },
  {
    name: "Colour Contrast Analyser (TPGi)",
    category: "Color & Contrast",
    description: "Desktop application to inspect foreground/background color ratios against WCAG 2.1 standards.",
    url: "https://www.tpgi.com/color-contrast-checker/",
    defaultReason: "Verifies visual text and UI component contrast ratios.",
  },
  {
    name: "Stark Accessibility Suite",
    category: "Design System & Figma",
    description: "Integrated contrast checker, focus order designer, and vision simulator.",
    url: "https://www.getstark.co/",
    defaultReason: "Catches accessibility issues directly in Figma design files before development.",
  },
];

export function getRecommendedTools(stats: ScanStats, findings: Finding[]): ToolRecommendation[] {
  return CATALOG_TOOLS.map((tool) => {
    let reason = tool.defaultReason;
    if (tool.triggerCondition) {
      const cond = tool.triggerCondition(stats, findings);
      if (cond.reason) reason = cond.reason;
    }

    return {
      name: tool.name,
      category: tool.category,
      description: tool.description,
      url: tool.url,
      reason,
    };
  });
}
