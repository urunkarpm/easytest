export type JobStatus =
  | "queued"
  | "loading_page"
  | "screenshot"
  | "checking_links"
  | "building_report"
  | "ready"
  | "failed";

export type FindingCategory = "headings" | "images" | "links" | "general";
export type FindingSeverity = "error" | "warning" | "info";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  message: string;
  elementSelector?: string;
  box?: BoundingBox;
  recommendation?: string;
}

export interface HeadingInfo {
  level: number; // 1 to 6
  text: string;
  box: BoundingBox;
  issues: string[];
}

export type ImageStatus = "pass" | "warning" | "fail";

export interface ImageInfo {
  src: string;
  alt: string | null;
  hasAltAttr: boolean;
  accessibleName: string;
  isDecorative: boolean;
  isInsideInteractive: boolean;
  box: BoundingBox;
  status: ImageStatus;
  issues: string[];
}

export type LinkStatus = "pass" | "redirect" | "fail" | "unverifiable";

export interface LinkResult {
  url: string;
  href: string;
  text: string;
  status: LinkStatus;
  statusCode?: number;
  finalUrl?: string;
  redirectChain?: string[];
  responseTimeMs?: number;
  box?: BoundingBox;
  isAnchor: boolean;
  anchorExists?: boolean;
  reason?: string;
}

export interface ToolRecommendation {
  name: string;
  description: string;
  url: string;
  reason: string;
  category: string;
}

export interface ScanStats {
  totalHeadings: number;
  headingErrors: number;
  totalImages: number;
  imagesMissingAlt: number;
  imagesEmptyAlt: number;
  totalLinks: number;
  passedLinks: number;
  failedLinks: number;
  unverifiableLinks: number;
  cappedLinks: boolean;
  durationMs: number;
}

export interface ReportUrls {
  zipUrl?: string;
  pdfUrl?: string;
  htmlUrl?: string;
  rawPngUrl?: string;
  annotatedPngUrl?: string;
  headingsPngUrl?: string;
  imagesPngUrl?: string;
  linksPngUrl?: string;
}

export interface ScanJob {
  jobId: string;
  targetUrl: string;
  domain: string;
  createdAt: string;
  status: JobStatus;
  progressPercent: number;
  currentStage: string;
  error?: string;
  isDownloaded?: boolean;
  downloadedAt?: string;
  reportUrls?: ReportUrls;
  stats?: ScanStats;
  findings?: Finding[];
  headings?: HeadingInfo[];
  images?: ImageInfo[];
  links?: LinkResult[];
  tools?: ToolRecommendation[];
  truncatedPage?: boolean;
  originalHeight?: number;
  capturedHeight?: number;
}
