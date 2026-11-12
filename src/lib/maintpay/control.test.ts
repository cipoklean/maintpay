import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  confirmReceipt,
  decide,
  evidenceProblem,
  interpretProvider,
  nearToYocto,
  prepareClaim,
  progress,
  transferBody,
  transferHttp,
  type Attempt,
  type GithubFacts,
  type Job,
} from "./control.ts";

const NOW = "2026-11-11T08:00:00.000Z";
const LATER = "2026-12-11T08:00:00.000Z";
const AMOUNT = nearToYocto("0.1")!;
const WALLET = "3915f5be3d2176169f4b01cf9ba59d749493d8c47e9d59c924ed444d3487c23e";
const RECIPIENT = "c602a59d5bf254cb4fd523d59ed74507ab2edf6ba15b89c0b4949d2090d24971";
const SHA = "7122094af2eb12d07852ec9ce75d124fcf89b05e";

function job(over: Partial<Job> = {}): Job {
  return {
    id: "MP-1",
    clientUserId: "client",
    clientEmail: "client@example.com",
    approverEmail: "approver@example.com",
    workerEmail: "worker@example.com",
    repository: "TestSprite/testsprite-cli",
    task: "Drop terminal escapes",
    criteria: "Arrow keys do not corrupt the key",
    recipient: RECIPIENT,
    amountYocto: AMOUNT,
    expiresAt: LATER,
    walletAddress: WALLET,
    status: "accepted",
    holdReason: null,
    holdRemedy: null,
    prNumber: 615,
    prUrl: "https://github.com/TestSprite/testsprite-cli/pull/615",
    headSha: SHA,
    prState: "merged",
    prTitle: "fix",
    termsHash: "terms",
    version: 3,
    decision: {
      approverUserId: "approver",
      approverEmail: "approver@example.com",
      decision: "accepted",
      headSha: SHA,
      termsHash: "terms",
      at: NOW,
    },
    attempt: null,
    deposits: [{ kind: "deposit", amountYocto: nearToYocto("2")!, txHash: "deposit" }],
    snapshot: { kind: "snapshot", amountYocto: nearToYocto("1.7")!, txHash: null },
    ...over,
  };
}

const facts: GithubFacts = { found: true, sha: SHA, state: "merged", draft: false };

function claimed(base: Job, body: string): Job {
  const attempt: Attempt = {
    id: "att-1",
    provider: "outlayer",
    walletAddress: base.walletAddress,
    requestBody: body,
    bodyHash: "hash",
    idempotencyKey: "key-1",
    state: "claimed",
    providerRequestId: null,
    providerStatus: null,
    providerError: null,
    txHash: null,
  };
  return { ...base, status: "payment_in_flight", attempt, version: base.version + 1 };
}

test("no acceptance means no outbound request", () => {
  const open = job({ status: "in_review", decision: null });
  const prepared = prepareClaim(open, facts, NOW, nearToYocto("1.7"));
  assert.ok("error" in prepared);
  assert.equal("body" in prepared, false);
});

test("the wrong approver is refused and the decision stays empty", () => {
  const waiting = job({ status: "in_review", decision: null });
  const refused = decide(waiting, { userId: "stranger", email: "stranger@example.com" }, "accepted", NOW);
  assert.ok(refused.error);
  assert.equal(refused.job.decision, null);
  assert.equal(refused.job.status, "in_review");
  const worker = decide(waiting, { userId: "worker", email: "worker@example.com" }, "accepted", NOW);
  assert.match(worker.error ?? "", /contributor/);
});

test("a changed head holds and does not prepare a transfer", () => {
  const problem = evidenceProblem(job(), { found: true, sha: "a".repeat(40), state: "open" }, NOW);
  assert.match(problem?.reason ?? "", /changed/);
  const prepared = prepareClaim(job(), { found: true, sha: "b".repeat(40), state: "open" }, NOW, AMOUNT);
  assert.ok("error" in prepared);
});

test("claim stores one body and header key, and a second claim loses", () => {
  const prepared = prepareClaim(job(), facts, NOW, nearToYocto("1.7"));
  assert.ok("body" in prepared);
  const body = prepared.body;
  assert.equal(body.includes("idempotency_key"), false);
  assert.deepEqual(JSON.parse(body), { chain: "near", to: RECIPIENT, amount: AMOUNT });
  const first = claimed(job(), body);
  const http = transferHttp(first.attempt!);
  assert.equal(http.headers["X-Idempotency-Key"], "key-1");
  assert.equal(http.body, body);
  const again = prepareClaim(first, facts, NOW, nearToYocto("1.7"));
  assert.match("error" in again ? again.error : "", /already exists/);
});

test("a crash reloads the same body and key", () => {
  const prepared = prepareClaim(job(), facts, NOW, AMOUNT);
  assert.ok("body" in prepared);
  const before = claimed(job(), prepared.body);
  const reloaded = structuredClone(before);
  assert.equal(reloaded.attempt?.requestBody, before.attempt?.requestBody);
  assert.equal(reloaded.attempt?.idempotencyKey, before.attempt?.idempotencyKey);
  assert.equal(transferHttp(reloaded.attempt!).headers["X-Idempotency-Key"], before.attempt?.idempotencyKey);
});

test("a same-key duplicate response is not paid", () => {
  const read = interpretProvider({
    http: 200,
    error: "duplicate_idempotency_key",
    requestId: "orig-1",
    status: "success",
  });
  assert.equal(read.paid, false);
  assert.equal(read.state, "read_original");
  assert.equal(read.requestId, "orig-1");
  assert.equal(read.blocksRetry, true);
});

test("unknown and needs_review block a new key and recovery", () => {
  for (const status of ["unknown", "needs_review", "processing"] as const) {
    const row = interpretProvider({ http: 200, requestId: "r", status });
    assert.equal(row.paid, false);
    assert.equal(row.blocksRetry, true);
    assert.equal(row.blocksRecovery, true);
  }
});

test("a bare failure is not proof the funds stayed", () => {
  const row = interpretProvider({ http: 200, requestId: "r", status: "failed" });
  assert.equal(row.state, "failed_unproven");
  assert.equal(row.blocksRecovery, true);
  assert.match(row.plain, /does not prove/);
});

test("provider success without a chain receipt is not paid", () => {
  const row = interpretProvider({ http: 200, requestId: "r", status: "success", txHash: "tx" });
  assert.equal(row.paid, false);
  assert.equal(row.state, "awaiting_chain");
  const waiting = job({
    status: "payment_in_flight",
    attempt: {
      id: "att",
      provider: "outlayer",
      walletAddress: WALLET,
      requestBody: transferBody(RECIPIENT, AMOUNT),
      bodyHash: "h",
      idempotencyKey: "k",
      state: "awaiting_chain",
      providerRequestId: "r",
      providerStatus: "success",
      providerError: null,
      txHash: "tx",
    },
  });
  const missing = confirmReceipt(waiting, { ok: false });
  assert.ok(missing.error);
  assert.notEqual(missing.job.status, "confirmed");
});

test("a real receipt confirms once and a replay does not pay again", () => {
  const waiting = job({
    status: "payment_in_flight",
    attempt: {
      id: "att",
      provider: "outlayer",
      walletAddress: WALLET,
      requestBody: transferBody(RECIPIENT, AMOUNT),
      bodyHash: "h",
      idempotencyKey: "k",
      state: "awaiting_chain",
      providerRequestId: "r",
      providerStatus: "success",
      providerError: null,
      txHash: "tx-real",
    },
  });
  const paid = confirmReceipt(waiting, {
    ok: true,
    success: true,
    signer: WALLET,
    receiver: RECIPIENT,
    deposit: AMOUNT,
    txHash: "tx-real",
  });
  assert.equal(paid.error, undefined);
  assert.equal(paid.job.status, "confirmed");
  assert.equal(paid.createdAttempt, false);
  const replay = confirmReceipt(paid.job, {
    ok: true,
    success: true,
    signer: WALLET,
    receiver: RECIPIENT,
    deposit: AMOUNT,
    txHash: "tx-real",
  });
  assert.match(replay.error ?? "", /does not pay again/);
  assert.equal(replay.job.attempt?.id, paid.job.attempt?.id);
});

test("cancel and claim cannot both win the same version", async () => {
  const db = new PGlite();
  await db.exec(`
    create table jobs (
      id text primary key,
      status text not null,
      version integer not null
    );
    create table attempts (
      id text primary key,
      job_id text unique references jobs(id),
      body text not null,
      idempotency_key text unique not null
    );
    insert into jobs values ('MP-1', 'accepted', 4);
  `);
  const claim = `
    with updated as (
      update jobs set status = 'payment_in_flight', version = version + 1
      where id = $1 and status = 'accepted' and version = $2
      returning id
    )
    insert into attempts (id, job_id, body, idempotency_key)
    select $3, $1, $4, $5 from updated
    returning id
  `;
  const cancel = `
    update jobs set status = 'cancelled', version = version + 1
    where id = $1 and version = $2 and status = 'accepted'
      and not exists (select 1 from attempts where job_id = jobs.id)
    returning id
  `;
  const seen = 4;
  const claimedRows = await db.query(claim, ["MP-1", seen, "att", transferBody(RECIPIENT, AMOUNT), "header-key"]);
  const cancelledRows = await db.query(cancel, ["MP-1", seen]);
  assert.equal(claimedRows.rows.length, 1);
  assert.equal(cancelledRows.rows.length, 0);
  const jobs = await db.query<{ status: string }>("select status from jobs");
  const attempts = await db.query<{ idempotency_key: string; body: string }>("select idempotency_key, body from attempts");
  assert.equal(jobs.rows[0].status, "payment_in_flight");
  assert.equal(attempts.rows.length, 1);
  assert.equal(attempts.rows[0].body.includes("idempotency_key"), false);
  assert.equal(attempts.rows[0].idempotency_key, "header-key");
  await db.close();
});

test("an unpaid job ladder does not end on Confirmed", () => {
  const names = progress(job({ status: "agreed", decision: null, attempt: null })).map((step) => step.name);
  assert.equal(names[0], "Agreed");
  assert.equal(names.at(-1), "Attempt stored");
  assert.equal(names.includes("Confirmed"), false);
  assert.equal(progress(job({ status: "confirmed" })).at(-1)?.name, "Confirmed");
});
