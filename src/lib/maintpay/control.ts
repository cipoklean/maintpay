export const TRANSFER_PATH = "/wallet/v1/transfer";

export type JobStatus =
  | "agreed"
  | "funding_observed"
  | "pr_ready"
  | "in_review"
  | "accepted"
  | "held"
  | "payment_in_flight"
  | "confirmed"
  | "cancelled"
  | "rejected";

export interface Attempt {
  id: string;
  provider: "outlayer";
  walletAddress: string;
  requestBody: string;
  bodyHash: string;
  idempotencyKey: string;
  state:
    | "claimed"
    | "read_original"
    | "blocked"
    | "failed_unproven"
    | "awaiting_chain"
    | "confirmed";
  providerRequestId: string | null;
  providerStatus: string | null;
  providerError: string | null;
  txHash: string | null;
}

export interface Decision {
  approverUserId: string;
  approverEmail: string;
  decision: "accepted" | "rejected";
  headSha: string;
  termsHash: string;
  at: string;
}

export interface Funding {
  kind: "deposit" | "snapshot";
  amountYocto: string;
  txHash: string | null;
}

export interface Job {
  id: string;
  clientUserId: string;
  clientEmail: string;
  approverEmail: string;
  workerEmail: string;
  repository: string;
  task: string;
  criteria: string;
  recipient: string;
  amountYocto: string;
  expiresAt: string;
  walletAddress: string;
  status: JobStatus;
  holdReason: string | null;
  holdRemedy: string | null;
  prNumber: number | null;
  prUrl: string | null;
  headSha: string | null;
  prState: "open" | "closed" | "merged" | null;
  prTitle: string | null;
  termsHash: string;
  version: number;
  decision: Decision | null;
  attempt: Attempt | null;
  deposits: Funding[];
  snapshot: Funding | null;
}

export interface GithubFacts {
  found: boolean;
  sha?: string;
  state?: "open" | "closed" | "merged";
  draft?: boolean;
  title?: string;
  url?: string;
  number?: number;
}

export interface ChainReceipt {
  ok: boolean;
  signer?: string;
  receiver?: string;
  deposit?: string;
  success?: boolean;
  txHash?: string;
}

export type ProviderBody =
  | {
      http: 200;
      error: "duplicate_idempotency_key";
      requestId: string;
      status: string;
    }
  | {
      http: 200;
      requestId: string;
      status: "success" | "completed" | "processing" | "needs_review" | "failed" | "unknown";
      txHash?: string | null;
    }
  | { http: number; error: string; requestId?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function nearToYocto(input: string): string | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,24})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const joined = `${whole}${(frac + "0".repeat(24)).slice(0, 24)}`.replace(/^0+/, "");
  return joined || "0";
}

export function coversAmount(balanceYocto: string, amountYocto: string) {
  if (!/^\d+$/.test(balanceYocto) || !/^\d+$/.test(amountYocto)) return false;
  const balance = balanceYocto.replace(/^0+/, "") || "0";
  const amount = amountYocto.replace(/^0+/, "") || "0";
  if (balance.length !== amount.length) return balance.length > amount.length;
  return balance >= amount;
}

export function formatNear(yocto: string) {
  if (!/^\d+$/.test(yocto)) return yocto;
  const padded = yocto.padStart(25, "0");
  const whole = padded.slice(0, -24).replace(/^0+/, "") || "0";
  const frac = padded.slice(-24, -20).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function termsHash(parts: {
  repository: string;
  task: string;
  criteria: string;
  approverEmail: string;
  workerEmail: string;
  recipient: string;
  amountYocto: string;
}) {
  return [
    parts.repository,
    parts.task,
    parts.criteria,
    parts.approverEmail.toLowerCase(),
    parts.workerEmail.toLowerCase(),
    parts.recipient,
    parts.amountYocto,
  ].join("|");
}

export function transferBody(recipient: string, amountYocto: string) {
  return JSON.stringify({ chain: "near", to: recipient, amount: amountYocto });
}

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function transferHttp(attempt: Pick<Attempt, "idempotencyKey" | "requestBody">) {
  return {
    method: "POST" as const,
    path: TRANSFER_PATH,
    headers: {
      "content-type": "application/json",
      "X-Idempotency-Key": attempt.idempotencyKey,
    },
    body: attempt.requestBody,
  };
}

export function assertCreate(input: {
  clientEmail: string;
  approverEmail: string;
  workerEmail: string;
  walletAddress: string;
  recipient: string;
  amountYocto: string;
  expiresAt: string;
  now: string;
}): string | null {
  const client = input.clientEmail.trim().toLowerCase();
  const approver = input.approverEmail.trim().toLowerCase();
  const worker = input.workerEmail.trim().toLowerCase();
  if (!EMAIL.test(client) || !EMAIL.test(approver) || !EMAIL.test(worker)) return "Use a real email for each person.";
  if (approver === worker) return "The approver and the contributor must be different people.";
  if (approver === client) return "The approver must not be the person paying.";
  if (!HEX64.test(input.walletAddress)) return "The dedicated wallet must be a 64-character testnet address.";
  if (!(HEX64.test(input.recipient) || ACCOUNT.test(input.recipient))) return "That recipient is not a NEAR account.";
  if (!/^\d+$/.test(input.amountYocto) || input.amountYocto === "0") return "Enter an amount greater than zero.";
  if (Number.isNaN(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.parse(input.now)) {
    return "The expiry must be in the future.";
  }
  return null;
}

export function decide(
  job: Job,
  actor: { userId: string; email: string },
  decision: "accepted" | "rejected",
  at: string,
): { job: Job; error?: string } {
  if (job.decision) return { job, error: "This snapshot already has a decision. It cannot be changed." };
  if (job.status !== "in_review" || !job.headSha) return { job, error: "Nothing is waiting for a decision." };
  const email = actor.email.trim().toLowerCase();
  if (email === job.workerEmail) return { job, error: "The contributor cannot approve their own work." };
  if (email !== job.approverEmail) return { job, error: "Only the designated approver can decide." };
  const next: Job = {
    ...job,
    decision: {
      approverUserId: actor.userId,
      approverEmail: email,
      decision,
      headSha: job.headSha,
      termsHash: job.termsHash,
      at,
    },
    status: decision === "accepted" ? "accepted" : "rejected",
    holdReason: null,
    holdRemedy: null,
    version: job.version + 1,
  };
  return { job: next };
}

export function evidenceProblem(job: Job, facts: GithubFacts, now: string): { reason: string; remedy: string } | null {
  if (Date.parse(job.expiresAt) <= Date.parse(now) && !job.attempt) {
    return {
      reason: "This job expired before a payment was sent.",
      remedy: "Create a new job. This one cannot be revived.",
    };
  }
  if (!facts.found || !facts.sha) {
    return {
      reason: "GitHub no longer shows this pull request.",
      remedy: "Do not pay. Ask the contributor for a public pull request.",
    };
  }
  if (facts.sha.toLowerCase() !== job.headSha) {
    return {
      reason: "The pull request head changed after it was accepted.",
      remedy: "Accept the new commit as its own snapshot, or do not pay.",
    };
  }
  if (facts.draft) {
    return { reason: "The pull request is still a draft.", remedy: "Wait until it is ready for review." };
  }
  if (facts.state === "closed") {
    return {
      reason: "The pull request was closed and not merged.",
      remedy: "Do not pay this snapshot. A merge, by itself, is not acceptance.",
    };
  }
  return null;
}

export function prepareClaim(job: Job, facts: GithubFacts, now: string, snapshotYocto: string | null): { error: string } | { body: string } {
  if (job.attempt) return { error: "A payment attempt already exists. Do not open another." };
  if (job.status !== "accepted" || job.decision?.decision !== "accepted") {
    return { error: "No payment leaves before the designated approver accepts this commit." };
  }
  if (!job.deposits.some((row) => coversAmount(row.amountYocto, job.amountYocto))) {
    return { error: "No checked deposit covers this amount. A balance reading is not a deposit." };
  }
  if (!snapshotYocto || !coversAmount(snapshotYocto, job.amountYocto)) {
    return { error: "The latest balance does not cover this amount. The client may have moved the funds." };
  }
  const problem = evidenceProblem(job, facts, now);
  if (problem) return { error: problem.reason };
  const body = transferBody(job.recipient, job.amountYocto);
  if (body.includes("idempotency_key")) return { error: "The transfer body must not carry the idempotency key." };
  return { body };
}

export function interpretProvider(response: ProviderBody): {
  state: Attempt["state"];
  paid: false;
  requestId: string | null;
  error: string | null;
  status: string | null;
  txHash: string | null;
  blocksRetry: boolean;
  blocksRecovery: boolean;
  plain: string;
} {
  if ("error" in response && response.error === "duplicate_idempotency_key") {
    return {
      state: "read_original",
      paid: false,
      requestId: response.requestId ?? null,
      error: "duplicate_idempotency_key",
      status: "status" in response ? response.status : null,
      txHash: null,
      blocksRetry: true,
      blocksRecovery: true,
      plain: "The provider pointed at an earlier request. That is not a payment. Read the original request.",
    };
  }
  if (!("status" in response) || response.http !== 200) {
    return {
      state: "blocked",
      paid: false,
      requestId: "requestId" in response ? (response.requestId ?? null) : null,
      error: "error" in response ? response.error : "unknown",
      status: null,
      txHash: null,
      blocksRetry: true,
      blocksRecovery: true,
      plain: "The outcome is unknown. Do not send another payment, and do not treat the money as returned.",
    };
  }
  if (response.status === "processing" || response.status === "needs_review" || response.status === "unknown") {
    return {
      state: "blocked",
      paid: false,
      requestId: response.requestId,
      error: null,
      status: response.status,
      txHash: "txHash" in response ? (response.txHash ?? null) : null,
      blocksRetry: true,
      blocksRecovery: true,
      plain:
        response.status === "needs_review"
          ? "The provider is holding this for review. Do not start another payment or a recovery."
          : "The payment is still in flight. Do not start another one, and do not recover the funds.",
    };
  }
  if (response.status === "failed") {
    return {
      state: "failed_unproven",
      paid: false,
      requestId: response.requestId,
      error: "failed",
      status: "failed",
      txHash: "txHash" in response ? (response.txHash ?? null) : null,
      blocksRetry: true,
      blocksRecovery: true,
      plain: "The provider reported a failure. That does not prove the money stayed put.",
    };
  }
  return {
    state: "awaiting_chain",
    paid: false,
    requestId: response.requestId,
    error: null,
    status: response.status,
    txHash: "txHash" in response ? (response.txHash ?? null) : null,
    blocksRetry: true,
    blocksRecovery: true,
    plain: "The provider reported success. It is not paid until the chain receipt matches the agreed recipient and amount.",
  };
}

export function confirmReceipt(job: Job, receipt: ChainReceipt): { job: Job; error?: string; createdAttempt: false } {
  if (!job.attempt) return { job, error: "There is no payment attempt to confirm.", createdAttempt: false };
  if (job.attempt.state === "confirmed" && job.status === "confirmed") {
    return { job, error: "This receipt is already recorded. It does not pay again.", createdAttempt: false };
  }
  if (job.attempt.state !== "awaiting_chain") {
    return { job, error: "A provider success is required before a chain receipt can mark this paid.", createdAttempt: false };
  }
  if (!receipt.ok || !receipt.success || !receipt.txHash || !receipt.signer || !receipt.receiver || !receipt.deposit) {
    return { job, error: "The chain receipt is missing or failed. This is not paid.", createdAttempt: false };
  }
  if (receipt.signer !== job.walletAddress || receipt.receiver !== job.recipient) {
    return { job, error: "The chain receipt is not between the agreed wallet and recipient.", createdAttempt: false };
  }
  if (receipt.deposit !== job.amountYocto) {
    return { job, error: "The chain receipt amount does not match the agreed amount.", createdAttempt: false };
  }
  if (job.attempt.txHash && job.attempt.txHash !== receipt.txHash) {
    return { job, error: "This receipt is a different transaction. It was not applied.", createdAttempt: false };
  }
  return {
    createdAttempt: false,
    job: {
      ...job,
      status: "confirmed",
      attempt: { ...job.attempt, state: "confirmed", txHash: receipt.txHash },
      version: job.version + 1,
    },
  };
}

export function canCancel(job: Job) {
  return !job.attempt && ["agreed", "funding_observed", "pr_ready", "in_review", "accepted", "rejected", "held"].includes(job.status);
}

export type StepName = "Agreed" | "Funding observed" | "PR ready" | "Human review" | "Attempt stored" | "Confirmed";

export function progress(job: Job): { name: StepName; done: boolean }[] {
  const funded = job.deposits.some((row) => coversAmount(row.amountYocto, job.amountYocto));
  const pr = Boolean(job.headSha);
  const reviewed = Boolean(job.decision);
  const flying = Boolean(job.attempt);
  const confirmed = job.status === "confirmed";
  const steps: { name: StepName; done: boolean }[] = [
    { name: "Agreed", done: true },
    { name: "Funding observed", done: funded },
    { name: "PR ready", done: pr },
    { name: "Human review", done: reviewed },
    { name: "Attempt stored", done: flying },
  ];
  if (confirmed) steps.push({ name: "Confirmed", done: true });
  return steps;
}
