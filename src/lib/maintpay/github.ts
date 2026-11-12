import { parsePullRequestUrl } from "./pr-url.ts";

export interface PublicPullRequest {
  repository: string;
  number: number;
  title: string;
  headSha: string;
  branch: string;
  author: string;
  htmlUrl: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
}

export type LoadPullResult = { ok: true; pull: PublicPullRequest } | { ok: false; error: string };

const SHA = /^[0-9a-f]{40}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?(?:\[bot\])?$/;

export async function fetchPublicPull(url: string): Promise<LoadPullResult> {
  const ref = parsePullRequestUrl(url);
  if (!ref) {
    return { ok: false, error: "Paste a public link like https://github.com/org/repo/pull/123." };
  }
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "MaintPay",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: "GitHub did not answer. Try the link again." };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, error: "GitHub redirected that request. It was not used." };
  }
  if (response.status === 404 || response.status === 401) {
    return { ok: false, error: "That pull request is not public, or it does not exist." };
  }
  if (response.status === 403 || response.status === 429) {
    return { ok: false, error: "GitHub is limiting requests right now. Wait a minute and try again." };
  }
  if (!response.ok) return { ok: false, error: "GitHub did not return that pull request." };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "GitHub returned something that was not a pull request." };
  }
  return readPull(body, ref);
}

function readPull(body: unknown, ref: { owner: string; repo: string; number: number }): LoadPullResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "GitHub returned something that was not a pull request." };
  }
  const row = body as Record<string, unknown>;
  const head = asRecord(row.head);
  const user = asRecord(row.user);
  const base = asRecord(row.base);
  const baseRepo = asRecord(base?.repo);
  const sha = typeof head?.sha === "string" ? head.sha.toLowerCase() : "";
  const repository = typeof baseRepo?.full_name === "string" ? baseRepo.full_name : "";
  const author = typeof user?.login === "string" ? user.login : "";
  // eslint-disable-next-line no-control-regex -- Strip terminal control characters from untrusted GitHub text.
  const title = typeof row.title === "string" ? row.title.replace(/[\u0000-\u001f]/g, "").trim() : "";
  const htmlUrl = typeof row.html_url === "string" ? row.html_url : "";
  // eslint-disable-next-line no-control-regex -- Strip terminal control characters from untrusted GitHub text.
  const branch = typeof head?.ref === "string" ? head.ref.replace(/[\u0000-\u001f]/g, "").trim() : "";
  const number = row.number;

  if (!SHA.test(sha)) return { ok: false, error: "GitHub did not return a full head SHA." };
  if (repository.toLowerCase() !== `${ref.owner}/${ref.repo}`.toLowerCase()) {
    return { ok: false, error: "That pull request does not belong to the repository in the link." };
  }
  if (number !== ref.number) return { ok: false, error: "GitHub returned a different pull request." };
  if (!LOGIN.test(author)) return { ok: false, error: "GitHub did not name the pull request author." };
  if (!htmlUrl.startsWith(`https://github.com/${repository}/pull/${ref.number}`)) {
    return { ok: false, error: "GitHub returned a link that is not this pull request." };
  }
  if (branch.length < 1 || branch.length > 250 || branch.includes(" ")) {
    return { ok: false, error: "GitHub did not name the head branch." };
  }

  const merged = row.merged === true || (typeof row.merged_at === "string" && row.merged_at.length > 0);
  const state: PublicPullRequest["state"] = merged ? "merged" : row.state === "closed" ? "closed" : "open";

  return {
    ok: true,
    pull: {
      repository,
      number: ref.number,
      title: title.slice(0, 180) || `Pull request #${ref.number}`,
      headSha: sha,
      branch: branch.slice(0, 120),
      author,
      htmlUrl: `https://github.com/${repository}/pull/${ref.number}`,
      state,
      draft: row.draft === true,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}
