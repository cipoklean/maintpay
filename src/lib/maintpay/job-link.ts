import { previewPathPrefix } from "../preview-path-prefix.ts";

const JOB_ID = /^MP-[a-zA-Z0-9]{4,12}$/;

export function isJobId(id: string) {
  return JOB_ID.test(id);
}

export function jobPath(id: string) {
  return `/job/${id}`;
}

/** Same-origin return path. Anything else becomes the dashboard. */
export function safeReturnPath(value: string | null | undefined) {
  if (value === "/") return "/";
  if (!value || value.includes("?") || value.includes("#") || value.includes("\\")) return "/";
  const id = /^\/job\/([^/]+)$/.exec(value)?.[1];
  if (id && isJobId(id)) return jobPath(id);
  return "/";
}

/** The link that is shown is the link that is copied. No query or hash. */
export function shareJobUrl(id: string, page: { origin: string; hostname: string; pathname: string }) {
  const prefix = previewPathPrefix(page.hostname, page.pathname) ?? "";
  return `${page.origin}${prefix}${jobPath(id)}`;
}
