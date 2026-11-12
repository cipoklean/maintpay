export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

/** Accept only a public github.com pull request URL. Never a host the caller chooses. */
export function parsePullRequestUrl(input: string): PullRequestRef | null {
  const raw = input.trim();
  if (raw.length < 10 || raw.length > 300) return null;
  if (/[\s@]/.test(raw)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 4 || parts[2] !== "pull") return null;
  const [owner, repo, , num, extra] = parts;
  if (extra && extra !== "files" && extra !== "commits" && extra !== "checks" && extra !== "changes") return null;
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;
  if (!/^[1-9]\d{0,9}$/.test(num)) return null;

  return { owner, repo, number: Number(num) };
}
