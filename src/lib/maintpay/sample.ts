/** Illustrative copy only. This module must not fetch, pay, or read a real job. */
export const SAMPLE_BANNER = "Illustrative example — no payment was made.";
export const SAMPLE_MODE = "Sample · read only";

export function isIllustrativeJob(job: {
  id: string;
  repository: string;
  recipient?: string;
  workerEmail?: string;
  approverEmail?: string;
}) {
  const repo = job.repository.trim().toLowerCase();
  const worker = job.workerEmail?.trim().toLowerCase() ?? "";
  const approver = job.approverEmail?.trim().toLowerCase() ?? "";
  const recipient = job.recipient?.trim().toLowerCase() ?? "";
  return (
    repo.startsWith("sample-org/") ||
    repo === "near-examples/storage-helper" ||
    job.id === "MP-1042" ||
    recipient === "example-worker.testnet" ||
    (worker === "contributor@example.com" && approver === "approver@example.com")
  );
}

export const sampleWalk = {
  readOnly: true as const,
  promise: "Agree the work first. A different person reviews that exact change. Payment waits on that decision.",
  client: {
    repository: "sample-org/storage-notes",
    task: "Make the storage check fail when the account has no storage",
    criteria: "The check fails closed, and a test covers the empty-account case",
    contributor: "contributor@example.com",
    approver: "approver@example.com",
    recipient: "A sample account named in the agreement",
    amount: "0.1 NEAR",
    expiry: "A date chosen before any work starts",
    warning:
      "The client controls the wallet and can take the money back before a payment is submitted. This is not escrow, and it is not a guaranteed payment.",
  },
  contributor: {
    warning:
      "You can see the amount and the deadline, but the client can still withdraw it. Do not treat this as money already set aside for you.",
    pullRequest: {
      verified: false,
      title: "Sample pull request #12",
      detail: "Not fetched from GitHub. This is not a real review.",
      head: "Snapshot A — not a real commit",
    },
  },
  approver: {
    note: "A person decides whether this snapshot meets the agreement. A merged pull request does not make that decision.",
    binds: [
      "The approver’s identity",
      "The agreed terms",
      "Sample pull request #12",
      "Snapshot A — not a real commit",
    ],
  },
  held: [
    {
      title: "Held — nobody has accepted it",
      reason: "The work is linked, but the designated person has not accepted this snapshot.",
      next: "The approver reviews this snapshot. Nothing is sent meanwhile.",
    },
    {
      title: "Held — the work changed",
      reason: "The pull request moved on from Snapshot A. The earlier look does not cover the new change.",
      next: "Review the new snapshot, or do not continue. The old acceptance does not carry over.",
    },
    {
      title: "Held — the amount is not covered",
      reason: "The latest reading of the wallet is short of 0.1 NEAR.",
      next: "The client can add funds and read the balance again. A reading is not a lock.",
    },
    {
      title: "Held — the result is unknown",
      reason: "A payment was attempted, and the answer never came back.",
      next: "Do not send another payment, and do not assume the money is still in the wallet. Read the original attempt before anyone decides again.",
    },
  ],
  confirmation: {
    title: "What a real confirmation would require",
    intro: "Nothing in this example was paid. There is no receipt to show.",
    needs: [
      "The payment provider finished successfully.",
      "A chain transaction paid the agreed recipient the agreed amount.",
      "MaintPay read that transaction back. A request number alone is not enough.",
    ],
  },
} as const;

export const sampleChapters = ["Client", "Contributor", "Approver", "Decision"] as const;
