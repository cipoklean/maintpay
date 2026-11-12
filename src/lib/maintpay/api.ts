import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  assertCreate,
  balanceReadProblem,
  canCancel,
  confirmReceipt,
  coversAmount,
  decide,
  depositStatus,
  evidenceProblem,
  formatNear,
  interpretProvider,
  nearToYocto,
  prepareClaim,
  preReviewProblem,
  pullProblem,
  progress,
  refreshAttemptProblem,
  sendAttemptProblem,
  sha256,
  termsHash,
  transferBody,
  UNKNOWN_SEND,
  verifiedEmailProblem,
  type GithubFacts,
  type Job,
  type JobStatus,
} from "./control";
import { isJobId } from "./job-link";
import { fetchPublicPull } from "./github";
import { fetchChainReceipt, readNativeBalance, verifyInbound } from "./near";
import { checkWalletKey, requestOutlayer } from "./outlayer";
import { beginSending, persistConfirmation, persistProvider } from "./payment-store";

export interface JobView {
  id: string;
  role: "client" | "contributor" | "approver";
  task: string;
  criteria: string;
  repository: string;
  recipient: string;
  amountLabel: string;
  expiresAt: string;
  walletAddress: string;
  status: JobStatus;
  holdReason: string | null;
  holdRemedy: string | null;
  prNumber: number | null;
  prUrl: string | null;
  headSha: string | null;
  prState: string | null;
  prTitle: string | null;
  clientEmail: string;
  approverEmail: string;
  workerEmail: string;
  snapshotLabel: string | null;
  depositLabel: string | null;
  gasLabel: string | null;
  covers: boolean;
  canCancel: boolean;
  progress: { name: string; done: boolean }[];
  attempt: null | {
    id: string;
    state: string;
    bodyHash: string;
    keyHint: string;
    providerRequestId: string | null;
    providerStatus: string | null;
    providerError: string | null;
    txHash: string | null;
  };
  events: { title: string; detail: string; at: string }[];
}

const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

async function caller(sql: Sql, userId: string) {
  const rows = await sql<{ email: string; emailVerified: boolean }>`select email, "emailVerified" from "user" where id = ${userId} limit 1`;
  const problem = verifiedEmailProblem(rows[0]);
  if (problem) throw new Error(problem);
  const email = rows[0]?.email?.trim().toLowerCase();
  if (!email) throw new Error("Your account has no email, so it cannot act on a job.");
  return { userId, email };
}

function roleOf(job: Job, email: string): JobView["role"] | null {
  if (email === job.clientEmail) return "client";
  if (email === job.workerEmail) return "contributor";
  if (email === job.approverEmail) return "approver";
  return null;
}

function view(job: Job, email: string, events: { title: string; detail: string; at: string }[]): JobView {
  const role = roleOf(job, email);
  if (!role) throw new Error("You are not part of this job.");
  const deposit = [...job.deposits].reverse().find((row) => coversAmount(row.amountYocto, job.amountYocto)) ?? null;
  const snap = job.snapshot?.amountYocto ?? null;
  let gas: string | null = null;
  if (snap && coversAmount(snap, job.amountYocto)) {
    const difference = (BigInt(snap) - BigInt(job.amountYocto)).toString();
    gas = formatNear(difference);
  }
  return {
    id: job.id,
    role,
    task: job.task,
    criteria: job.criteria,
    repository: job.repository,
    recipient: job.recipient,
    amountLabel: `${formatNear(job.amountYocto)} NEAR`,
    expiresAt: job.expiresAt,
    walletAddress: job.walletAddress,
    status: job.status,
    holdReason: job.holdReason,
    holdRemedy: job.holdRemedy,
    prNumber: job.prNumber,
    prUrl: job.prUrl,
    headSha: job.headSha,
    prState: job.prState,
    prTitle: job.prTitle,
    clientEmail: job.clientEmail,
    approverEmail: job.approverEmail,
    workerEmail: job.workerEmail,
    snapshotLabel: snap ? `${formatNear(snap)} NEAR` : null,
    depositLabel: deposit ? `${formatNear(deposit.amountYocto)} NEAR` : null,
    gasLabel: gas ? `${gas} NEAR` : null,
    covers: Boolean(snap && coversAmount(snap, job.amountYocto)),
    canCancel: role === "client" && canCancel(job),
    progress: progress(job),
    attempt: job.attempt
      ? {
          id: job.attempt.id,
          state: job.attempt.state,
          bodyHash: job.attempt.bodyHash,
          keyHint: `${job.attempt.idempotencyKey.slice(0, 4)}…${job.attempt.idempotencyKey.slice(-4)}`,
          providerRequestId: job.attempt.providerRequestId,
          providerStatus: job.attempt.providerStatus,
          providerError: job.attempt.providerError,
          txHash: job.attempt.txHash,
        }
      : null,
    events,
  };
}

async function loadJob(sql: Sql, id: string): Promise<Job | null> {
  const rows = await sql<Record<string, unknown>>`select * from jobs where id = ${id} limit 1`;
  const row = rows[0];
  if (!row) return null;
  const funding = await sql<{ kind: string; amount_yocto: string; tx_hash: string | null }>`
    select kind, amount_yocto, tx_hash from funding where job_id = ${id} order by created_at asc
  `;
  const decisions = await sql<Record<string, unknown>>`select * from decisions where job_id = ${id} limit 1`;
  const attempts = await sql<Record<string, unknown>>`select * from attempts where job_id = ${id} limit 1`;
  const decision = decisions[0];
  const attempt = attempts[0];
  const deposits = funding.filter((item) => item.kind === "deposit").map((item) => ({
    kind: "deposit" as const,
    amountYocto: item.amount_yocto,
    txHash: item.tx_hash,
  }));
  const snapshots = funding.filter((item) => item.kind === "snapshot");
  const latest = snapshots[snapshots.length - 1];
  return {
    id: String(row.id),
    clientUserId: String(row.client_user_id),
    clientEmail: String(row.client_email),
    approverEmail: String(row.approver_email),
    workerEmail: String(row.worker_email),
    repository: String(row.repository),
    task: String(row.task),
    criteria: String(row.criteria),
    recipient: String(row.recipient),
    amountYocto: String(row.amount_yocto),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    walletAddress: String(row.wallet_address),
    status: row.status as Job["status"],
    holdReason: row.hold_reason ? String(row.hold_reason) : null,
    holdRemedy: row.hold_remedy ? String(row.hold_remedy) : null,
    prNumber: row.pr_number == null ? null : Number(row.pr_number),
    prUrl: row.pr_url ? String(row.pr_url) : null,
    headSha: row.head_sha ? String(row.head_sha) : null,
    prState: (row.pr_state as Job["prState"]) ?? null,
    prTitle: row.pr_title ? String(row.pr_title) : null,
    termsHash: String(row.terms_hash),
    version: Number(row.version),
    decision: decision
      ? {
          approverUserId: String(decision.approver_user_id),
          approverEmail: String(decision.approver_email),
          decision: decision.decision as "accepted" | "rejected",
          headSha: String(decision.head_sha),
          termsHash: String(decision.terms_hash),
          at: new Date(String(decision.created_at)).toISOString(),
        }
      : null,
    attempt: attempt
      ? {
          id: String(attempt.id),
          provider: "outlayer",
          walletAddress: String(attempt.wallet_address),
          requestBody: String(attempt.request_body),
          bodyHash: String(attempt.body_hash),
          idempotencyKey: String(attempt.idempotency_key),
          state: attempt.state as Job["attempt"] extends infer T ? (T extends { state: infer S } ? S : never) : never,
          providerRequestId: attempt.provider_request_id ? String(attempt.provider_request_id) : null,
          providerStatus: attempt.provider_status ? String(attempt.provider_status) : null,
          providerError: attempt.provider_error ? String(attempt.provider_error) : null,
          txHash: attempt.tx_hash ? String(attempt.tx_hash) : null,
        }
      : null,
    deposits,
    snapshot: latest ? { kind: "snapshot", amountYocto: latest.amount_yocto, txHash: null } : null,
  };
}

async function eventsFor(sql: Sql, id: string) {
  const rows = await sql<{ title: string; detail: string; created_at: string }>`
    select title, detail, created_at from job_events where job_id = ${id} order by id desc limit 12
  `;
  return rows.map((row) => ({ title: row.title, detail: row.detail, at: new Date(row.created_at).toISOString() }));
}

async function present(sql: Sql, id: string, email: string) {
  const job = await loadJob(sql, id);
  if (!job || !roleOf(job, email)) return null;
  return view(job, email, await eventsFor(sql, id));
}

export const listJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<JobView[]> => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const rows = await sql<{ id: string }>`
      select id from jobs
      where client_user_id = ${me.userId}
         or lower(approver_email) = ${me.email}
         or lower(worker_email) = ${me.email}
      order by created_at desc
      limit 20
    `;
    const views: JobView[] = [];
    for (const row of rows) {
      const item = await present(sql, row.id, me.email);
      if (item) views.push(item);
    }
    return views;
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { jobId?: string }) => ({ jobId: typeof input?.jobId === "string" ? input.jobId.trim() : "" }))
  .handler(async ({ data, context }) => {
    if (!isJobId(data.jobId)) return { ok: false as const };
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await present(sql, data.jobId, me.email);
    if (!job) return { ok: false as const };
    return { ok: true as const, job };
  });

export const createJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    repository: string;
    task: string;
    criteria: string;
    approverEmail: string;
    workerEmail: string;
    recipient: string;
    amount: string;
    expiresAt: string;
    walletAddress: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const amountYocto = nearToYocto(data.amount ?? "");
    const repository = (data.repository ?? "").trim();
    const task = (data.task ?? "").trim();
    const criteria = (data.criteria ?? "").trim();
    if (!REPO.test(repository)) return { ok: false as const, error: "Use a repository like owner/name." };
    if (task.length < 8 || task.length > 180) return { ok: false as const, error: "Describe the work in a short sentence." };
    if (criteria.length < 8 || criteria.length > 400) return { ok: false as const, error: "Say how you will know the work is done." };
    const now = new Date().toISOString();
    const problem = assertCreate({
      clientEmail: me.email,
      approverEmail: data.approverEmail ?? "",
      workerEmail: data.workerEmail ?? "",
      walletAddress: (data.walletAddress ?? "").trim().toLowerCase(),
      recipient: (data.recipient ?? "").trim().toLowerCase(),
      amountYocto: amountYocto ?? "0",
      expiresAt: data.expiresAt,
      now,
    });
    if (problem || !amountYocto) return { ok: false as const, error: problem ?? "Enter an amount greater than zero." };
    const approver = data.approverEmail.trim().toLowerCase();
    const worker = data.workerEmail.trim().toLowerCase();
    const id = `MP-${crypto.randomUUID().slice(0, 8)}`;
    const hash = await termsHash({
      repository,
      task,
      criteria,
      approverEmail: approver,
      workerEmail: worker,
      recipient: data.recipient.trim().toLowerCase(),
      amountYocto,
      expiresAt: data.expiresAt,
      walletAddress: data.walletAddress.trim().toLowerCase(),
    });
    try {
      await sql`
      insert into jobs (
        id, client_user_id, client_email, approver_email, worker_email, repository, task, criteria,
        recipient, amount_yocto, expires_at, wallet_address, status, terms_hash
      ) values (
        ${id}, ${me.userId}, ${me.email}, ${approver}, ${worker}, ${repository}, ${task}, ${criteria},
        ${data.recipient.trim().toLowerCase()}, ${amountYocto}, ${data.expiresAt}, ${data.walletAddress.trim().toLowerCase()},
        'agreed', ${hash}
      )
    `;
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "jobs_active_wallet_unique") {
        return { ok: false as const, error: "That wallet already has an active job." };
      }
      throw error;
    }
    await sql`insert into job_events (job_id, title, detail) values (${id}, 'Agreed', 'The terms are fixed. The client can still move funds outside MaintPay.')`;
    const item = await present(sql, id, me.email);
    return { ok: true as const, job: item };
  });

export const readBalance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || !roleOf(job, me.email)) return { ok: false as const, error: "That job is not yours." };
    const problem = balanceReadProblem(job, me.email);
    if (problem) return { ok: false as const, error: problem };
    const balance = await readNativeBalance(job.walletAddress);
    if (!balance.ok) return { ok: false as const, error: balance.error };
    await sql`
      insert into funding (id, job_id, kind, amount_yocto, block_height)
      values (${crypto.randomUUID()}, ${job.id}, 'snapshot', ${balance.yocto}, ${balance.blockHeight})
    `;
    await sql`
      insert into job_events (job_id, title, detail)
      values (${job.id}, 'Balance read', ${`Snapshot ${formatNear(balance.yocto)} NEAR at block ${balance.blockHeight}. This is not a deposit.`})
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

export const checkDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; txHash: string; sender: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || roleOf(job, me.email) !== "client") return { ok: false as const, error: "Only the client can record a deposit." };
    const problem = preReviewProblem(job, new Date().toISOString());
    if (problem) return { ok: false as const, error: problem };
    const checked = await verifyInbound((data.txHash ?? "").trim(), (data.sender ?? "").trim().toLowerCase(), job.walletAddress);
    if (!checked.ok) return { ok: false as const, error: checked.error };
    if (!coversAmount(checked.deposit, job.amountYocto)) {
      return { ok: false as const, error: "That transfer arrived, but it is less than the agreed amount." };
    }
    const next = depositStatus(job, new Date().toISOString());
    if (!next) return { ok: false as const, error: "The job changed. Read it again." };
    try {
      const inserted = await sql<{ id: string }>`
        with updated as (
          update jobs set status = ${next}, version = version + 1
          where id = ${job.id} and version = ${job.version} and status = ${job.status}
            and status in ('agreed', 'funding_observed', 'pr_ready', 'in_review')
            and expires_at > now()
            and not exists (select 1 from decisions where job_id = jobs.id)
            and not exists (select 1 from attempts where job_id = jobs.id)
          returning id
        )
        insert into funding (id, job_id, kind, amount_yocto, tx_hash, sender)
        select ${crypto.randomUUID()}, id, 'deposit', ${checked.deposit}, ${data.txHash.trim()}, ${data.sender.trim().toLowerCase()}
        from updated returning id
      `;
      if (!inserted.length) return { ok: false as const, error: "The job changed. Read it again." };
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "funding_deposit_tx_unique") {
        return { ok: false as const, error: "That deposit transaction has already been recorded." };
      }
      throw error;
    }
    await sql`
      insert into job_events (job_id, title, detail)
      values (${job.id}, 'Deposit checked', ${`A transfer into the wallet was checked. It is one receipt, not a lock.`})
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

export const linkPull = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; url: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || roleOf(job, me.email) !== "contributor") return { ok: false as const, error: "Only the contributor can link the pull request." };
    const problem = preReviewProblem(job, new Date().toISOString());
    if (problem) return { ok: false as const, error: problem };
    const loaded = await fetchPublicPull(data.url ?? "");
    if (!loaded.ok) return { ok: false as const, error: loaded.error };
    const pullError = pullProblem({ found: true, sha: loaded.pull.headSha, state: loaded.pull.state, draft: loaded.pull.draft });
    if (pullError) return { ok: false as const, error: pullError };
    if (loaded.pull.repository.toLowerCase() !== job.repository.toLowerCase()) {
      return { ok: false as const, error: "That pull request is not in the agreed repository." };
    }
    const status = job.deposits.some((row) => coversAmount(row.amountYocto, job.amountYocto)) ? "in_review" : "pr_ready";
    const updated = await sql<{ id: string }>`
      update jobs set
        pr_number = ${loaded.pull.number},
        pr_url = ${loaded.pull.htmlUrl},
        head_sha = ${loaded.pull.headSha},
        pr_state = ${loaded.pull.state},
        pr_title = ${loaded.pull.title},
        status = ${status},
        version = version + 1
      where id = ${job.id} and version = ${job.version}
        and status in ('agreed', 'funding_observed', 'pr_ready', 'in_review')
        and expires_at > now()
        and not exists (select 1 from decisions where job_id = jobs.id)
        and not exists (select 1 from attempts where job_id = jobs.id)
      returning id
    `;
    if (!updated.length) return { ok: false as const, error: "The job changed. Read it again." };
    await sql`
      insert into job_events (job_id, title, detail)
      values (${job.id}, 'Pull request read', ${`PR #${loaded.pull.number} at ${loaded.pull.headSha}. The SHA came from GitHub.`})
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

export const review = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; decision: "accepted" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job) return { ok: false as const, error: "That job is not yours." };
    const facts = await currentFacts(job);
    if (data.decision === "accepted") {
      const problem = job.headSha ? evidenceProblem({ ...job, status: "accepted" }, facts, new Date().toISOString()) : { reason: "GitHub has no commit to accept.", remedy: "" };
      if (!facts.found || facts.sha !== job.headSha || facts.draft || facts.state === "closed") {
        return { ok: false as const, error: problem?.reason ?? "This commit cannot be accepted." };
      }
    }
    const result = decide(job, me, data.decision, new Date().toISOString());
    if (result.error) return { ok: false as const, error: result.error };
    const decision = result.job.decision;
    if (!decision) return { ok: false as const, error: "The decision was not recorded." };
    const inserted = await sql<{ id: string }>`
      with updated as (
        update jobs set status = ${result.job.status}, version = version + 1
        where id = ${job.id} and status = 'in_review' and version = ${job.version}
          and expires_at > now()
          and not exists (select 1 from decisions where job_id = jobs.id)
          and not exists (select 1 from attempts where job_id = jobs.id)
        returning id
      )
      insert into decisions (id, job_id, approver_user_id, approver_email, decision, head_sha, terms_hash)
      select ${crypto.randomUUID()}, id, ${me.userId}, ${me.email}, ${data.decision}, ${decision.headSha}, ${decision.termsHash}
      from updated
      returning id
    `;
    if (!inserted.length) return { ok: false as const, error: "The job changed. Read it again." };
    await sql`
      insert into job_events (job_id, title, detail)
      values (
        ${job.id},
        ${data.decision === "accepted" ? "Accepted" : "Not accepted"},
        ${data.decision === "accepted"
          ? `Accepted ${decision.headSha}. This can start one payment attempt. It does not lock the wallet.`
          : "The work was not accepted. No payment moves."}
      )
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

export const claimAttempt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || roleOf(job, me.email) !== "client") return { ok: false as const, error: "Only the client can prepare a payment." };
    const facts = await currentFacts(job);
    const problem = evidenceProblem(job, facts, new Date().toISOString());
    if (problem) {
      await sql`
        update jobs set status = 'held', hold_reason = ${problem.reason}, hold_remedy = ${problem.remedy}, version = version + 1
        where id = ${job.id} and version = ${job.version} and not exists (select 1 from attempts where job_id = ${job.id})
      `;
      await sql`insert into job_events (job_id, title, detail) values (${job.id}, 'Held', ${problem.reason})`;
      return { ok: false as const, error: problem.reason, job: await present(sql, job.id, me.email) };
    }
    const fresh = await readNativeBalance(job.walletAddress);
    if (fresh.ok) {
      await sql`
        insert into funding (id, job_id, kind, amount_yocto, block_height)
        values (${crypto.randomUUID()}, ${job.id}, 'snapshot', ${fresh.yocto}, ${fresh.blockHeight})
      `;
    }
    const prepared = prepareClaim(job, facts, new Date().toISOString(), fresh.ok ? fresh.yocto : null);
    if ("error" in prepared) return { ok: false as const, error: prepared.error };
    const key = crypto.randomUUID();
    const body = transferBody(job.recipient, job.amountYocto);
    const hash = await sha256(body);
    const attemptId = crypto.randomUUID();
    const inserted = await sql<{ id: string }>`
      with updated as (
        update jobs set status = 'payment_in_flight', version = version + 1
        where id = ${job.id} and status = 'accepted' and version = ${job.version}
          and not exists (select 1 from attempts where job_id = ${job.id})
        returning id
      )
      insert into attempts (id, job_id, provider, wallet_address, request_body, body_hash, idempotency_key, state)
      select ${attemptId}, ${job.id}, 'outlayer', ${job.walletAddress}, ${body}, ${hash}, ${key}, 'claimed'
      from updated
      returning id
    `;
    if (!inserted.length) return { ok: false as const, error: "The payment was not claimed. Cancel or another attempt won." };
    await sql`
      insert into job_events (job_id, title, detail)
      values (${job.id}, 'Attempt stored', 'The transfer body and header key are stored. Nothing has been sent.')
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

async function confirmStoredPayment(sql: Sql, job: Job): Promise<string | null> {
  if (!job.attempt?.txHash || job.attempt.state !== "awaiting_chain") return "This attempt is not awaiting a chain receipt.";
  const receipt = await fetchChainReceipt(job.attempt.txHash, job.walletAddress);
  const result = confirmReceipt(job, receipt);
  if (result.error) return result.error;
  return await persistConfirmation(sql, job) ? null : "The job changed. Read it again.";
}

async function performAttempt(jobId: string, apiKey: string, userId: string, action: "send" | "refresh") {
  const sql = await getSql();
  const me = await caller(sql, userId);
  let job = await loadJob(sql, jobId);
  if (!job || roleOf(job, me.email) !== "client") return { ok: false as const, error: "Only the client can send or check a payment." };
  const problem = action === "send" ? sendAttemptProblem(job) : refreshAttemptProblem(job);
  if (problem) return { ok: false as const, error: problem };
  if (await sha256(job.attempt!.requestBody) !== job.attempt!.bodyHash) return { ok: false as const, error: "The stored transfer body failed its integrity check. Nothing was sent." };
  const keyProblem = await checkWalletKey(apiKey, job.walletAddress);
  if (keyProblem) return { ok: false as const, error: keyProblem };
  if (action === "send") {
    if (!await beginSending(sql, job)) return { ok: false as const, error: "The job changed. Read it again." };
    job = { ...job, version: job.version + 1, attempt: { ...job.attempt!, state: "sending" } };
  }
  const response = await requestOutlayer(apiKey, job.attempt!, action);
  const read = response ? interpretProvider(response) : {
    ...interpretProvider({ http: 0 }), state: action === "send" ? "sending" as const : job.attempt!.state,
    plain: action === "send" ? UNKNOWN_SEND : "Status unknown. Check the original request again; do not create another payment.",
  };
  if (!await persistProvider(sql, job, read)) return { ok: false as const, error: "The job changed. Read it again.", job: await present(sql, job.id, me.email) };
  const current = await loadJob(sql, job.id);
  const confirmationError = current?.attempt?.state === "awaiting_chain" ? await confirmStoredPayment(sql, current) : null;
  return {
    ok: Boolean(response) && !confirmationError,
    error: confirmationError ?? (response ? undefined : read.plain),
    job: await present(sql, job.id, me.email),
  };
}

export const sendAttempt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; apiKey: string }) => ({ jobId: input.jobId, apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "" }))
  .handler(async ({ data, context }) => performAttempt(data.jobId, data.apiKey, context.userId, "send"));

export const refreshAttempt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; apiKey: string }) => ({ jobId: input.jobId, apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "" }))
  .handler(async ({ data, context }) => performAttempt(data.jobId, data.apiKey, context.userId, "refresh"));

export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || roleOf(job, me.email) !== "client") return { ok: false as const, error: "Only the client can confirm a payment." };
    const error = await confirmStoredPayment(sql, job);
    return { ok: !error, error: error ?? undefined, job: await present(sql, job.id, me.email) };
  });

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const me = await caller(sql, context.userId);
    const job = await loadJob(sql, data.jobId);
    if (!job || roleOf(job, me.email) !== "client") return { ok: false as const, error: "Only the client can cancel." };
    if (!canCancel(job)) return { ok: false as const, error: "A payment attempt is open. Do not cancel beside it." };
    const updated = await sql<{ id: string }>`
      update jobs set status = 'cancelled', version = version + 1
      where id = ${job.id} and version = ${job.version}
        and status in ('agreed', 'funding_observed', 'pr_ready', 'in_review', 'accepted', 'rejected', 'held')
        and not exists (select 1 from attempts where job_id = jobs.id)
      returning id
    `;
    if (!updated.length) return { ok: false as const, error: "Cancellation lost to a payment attempt, or the job already changed." };
    await sql`
      insert into job_events (job_id, title, detail)
      values (${job.id}, 'Cancelled', 'MaintPay will not pay. This is not a recovered transfer.')
    `;
    return { ok: true as const, job: await present(sql, job.id, me.email) };
  });

async function currentFacts(job: Job): Promise<GithubFacts> {
  if (!job.prUrl) return { found: false };
  const loaded = await fetchPublicPull(job.prUrl);
  if (!loaded.ok) return { found: false };
  return {
    found: true,
    sha: loaded.pull.headSha,
    state: loaded.pull.state,
    draft: loaded.pull.draft,
    title: loaded.pull.title,
    url: loaded.pull.htmlUrl,
    number: loaded.pull.number,
  };
}
