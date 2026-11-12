import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { confirmReceipt, interpretProvider, refreshAttemptProblem, sendAttemptProblem, sha256, UNKNOWN_SEND, type Job } from "./control.ts";
import { fetchChainReceipt, parseChainReceipt } from "./near.ts";
import { checkWalletKey, requestOutlayer } from "./outlayer.ts";
import { beginSending, persistConfirmation, persistProvider } from "./payment-store.ts";

const wallet = "a".repeat(64);
const txHash = "A".repeat(44);
const apiKey = `wk_${"b".repeat(64)}`;
const body = '{"chain":"near","to":"recipient.testnet","amount":"10000000000000000000000"}';

async function fixture(): Promise<Job> {
  return {
    id: "job", clientUserId: "client", clientEmail: "client@demo.maintpay", workerEmail: "worker@demo.maintpay", approverEmail: "approver@demo.maintpay",
    repository: "org/repo", task: "task", criteria: "criteria", recipient: "recipient.testnet", amountYocto: "10000000000000000000000", expiresAt: "2099-01-01T00:00:00Z",
    walletAddress: wallet, status: "payment_in_flight", holdReason: null, holdRemedy: null, prNumber: 1, prUrl: "https://github.com/org/repo/pull/1", headSha: "c".repeat(40), prState: "merged", prTitle: "task", termsHash: "terms", version: 1,
    decision: { approverUserId: "approver", approverEmail: "approver@demo.maintpay", decision: "accepted", headSha: "c".repeat(40), termsHash: "terms", at: "2026-01-01T00:00:00Z" },
    deposits: [], snapshot: null,
    attempt: { id: "attempt", provider: "outlayer", walletAddress: wallet, requestBody: body, bodyHash: await sha256(body), idempotencyKey: "same-stored-key", state: "claimed", providerRequestId: null, providerStatus: null, providerError: null, txHash: null },
  };
}

test("only a claimed or sending in-flight attempt can send; refresh requires an original request", async () => {
  const job = await fixture();
  assert.equal(sendAttemptProblem(job), null);
  for (const state of ["sending", "blocked", "read_original", "awaiting_chain", "confirmed", "failed_unproven"] as const) {
    job.attempt!.state = state;
    assert.equal(sendAttemptProblem(job) === null, state === "sending");
  }
  job.attempt!.state = "sending";
  assert.ok(refreshAttemptProblem(job));
  job.attempt!.providerRequestId = "request";
  assert.equal(refreshAttemptProblem(job), null);
  job.status = "cancelled";
  assert.ok(sendAttemptProblem(job));
  assert.ok(refreshAttemptProblem(job));
  job.status = "payment_in_flight";
  job.attempt!.walletAddress = "b".repeat(64);
  assert.ok(sendAttemptProblem(job));
  job.attempt = null;
  assert.ok(sendAttemptProblem(job));
});

test("provider statuses are exact, snake_case is handled, and duplicates never mean paid", () => {
  for (const status of ["processing", "pending_approval", "needs_review", "unknown", "completed", "confirmed", "", "invented"]) {
    const read = interpretProvider({ http: 200, request_id: "request", status, tx_hash: txHash });
    assert.equal(read.state, "blocked", status);
    assert.equal(read.paid, false);
  }
  const duplicate = interpretProvider({ http: 200, error: "duplicate_idempotency_key", request_id: "original", status: "success", tx_hash: txHash });
  assert.equal(duplicate.state, "read_original");
  assert.equal(duplicate.requestId, "original");
  assert.equal(duplicate.txHash, null);
  const busy = interpretProvider({ http: 409, error: "wallet_busy", in_flight_request_id: "in-flight" });
  assert.equal(busy.state, "blocked");
  assert.equal(busy.requestId, "in-flight");
  for (const flag of ["never_executed", "never_submitted"]) {
    const failed = interpretProvider({ http: 200, status: "failed", result: { [flag]: true } });
    assert.equal(failed.state, "failed_unproven");
    assert.match(failed.plain, /nothing moved/);
  }
  assert.match(interpretProvider({ http: 200, status: "failed" }).plain, /does not prove/);
  assert.equal(interpretProvider({ http: 200, status: "success" }).state, "blocked");
  assert.equal(interpretProvider({ http: 200, status: "success", result: { tx_hash: txHash } }).state, "awaiting_chain");
  assert.equal(interpretProvider({ http: 503, status: "success", tx_hash: txHash }).state, "blocked");
});

function receipt() {
  return { result: { final_execution_status: "FINAL", transaction: { hash: txHash, signer_id: wallet, receiver_id: "recipient.testnet", actions: [{ Transfer: { deposit: "10000000000000000000000" } }] }, status: { SuccessValue: "" } } };
}

test("only final successful single native transfers with matching terms can confirm", async () => {
  const job = await fixture();
  job.attempt!.state = "awaiting_chain";
  job.attempt!.txHash = txHash;
  assert.equal(confirmReceipt(job, parseChainReceipt(receipt(), txHash)).job.status, "confirmed");
  assert.deepEqual(parseChainReceipt(null, txHash), { ok: false });
  assert.deepEqual(parseChainReceipt({}, txHash), { ok: false });
  assert.deepEqual(parseChainReceipt(receipt(), "B".repeat(44)), { ok: false });
  for (const change of ["pending", "failure", "multiple", "amount", "signer", "receiver", "not-native"]) {
    const value = receipt();
    if (change === "pending") value.result.final_execution_status = "EXECUTED";
    if (change === "failure") Object.assign(value.result, { status: { Failure: {} } });
    if (change === "multiple") value.result.transaction.actions.push({ Transfer: { deposit: "1" } });
    if (change === "amount") value.result.transaction.actions[0].Transfer.deposit = "1";
    if (change === "signer") value.result.transaction.signer_id = "b".repeat(64);
    if (change === "receiver") value.result.transaction.receiver_id = "other.testnet";
    if (change === "not-native") value.result.transaction.actions = [];
    assert.ok(confirmReceipt(job, parseChainReceipt(value, txHash)).error, change);
  }
});

test("provider transport checks wallet ownership and recovery reuses stored bytes/key", async () => {
  const original = globalThis.fetch;
  const job = await fixture();
  let sends = 0;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${apiKey}`);
      assert.equal(init?.redirect, "manual");
      if (String(url).endsWith("address?chain=near")) return Response.json({ address: wallet });
      if (String(url).includes("/requests/")) {
        assert.equal(init?.method, "GET");
        return Response.json({ request_id: "original", status: "success", result: { tx_hash: txHash } });
      }
      sends += 1;
      assert.equal(init?.body, job.attempt!.requestBody);
      assert.equal(new Headers(init?.headers).get("X-Idempotency-Key"), job.attempt!.idempotencyKey);
      if (sends === 1) throw new Error("timeout");
      return Response.json({ error: "duplicate_idempotency_key", request_id: "original", status: "success", tx_hash: txHash });
    };
    assert.equal(await checkWalletKey(apiKey, wallet), null);
    assert.equal(await checkWalletKey(apiKey, "c".repeat(64)), "That key controls a different wallet.");
    assert.ok(await checkWalletKey("", wallet));
    assert.equal(await requestOutlayer(apiKey, job.attempt!, "send"), null);
    const recovered = interpretProvider((await requestOutlayer(apiKey, job.attempt!, "send"))!);
    assert.equal(recovered.requestId, "original");
    assert.equal(recovered.state, "read_original");
    job.attempt!.providerRequestId = recovered.requestId;
    assert.equal(interpretProvider((await requestOutlayer(apiKey, job.attempt!, "refresh"))!).state, "awaiting_chain");
    globalThis.fetch = async () => Response.json({ request_id: apiKey, status: apiKey, error: apiKey, tx_hash: apiKey });
    assert.equal(JSON.stringify(await requestOutlayer(apiKey, job.attempt!, "send")).includes(apiKey), false);
    globalThis.fetch = async () => { throw new Error(apiKey); };
    assert.equal(await requestOutlayer(apiKey, job.attempt!, "refresh"), null);
    assert.ok(await checkWalletKey(apiKey, wallet));
    globalThis.fetch = async () => Response.json({ error: "missing" }, { status: 503 });
    assert.ok(await checkWalletKey(apiKey, wallet));
    globalThis.fetch = async () => Response.json(null);
    assert.equal(await requestOutlayer(apiKey, job.attempt!, "send"), null);
  } finally {
    globalThis.fetch = original;
  }
});

test("receipt RPC requests the wallet signer and FINAL, failing closed on errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.method, "EXPERIMENTAL_tx_status");
      assert.deepEqual(body.params, { tx_hash: txHash, sender_account_id: wallet, wait_until: "FINAL" });
      return Response.json(receipt());
    };
    assert.equal((await fetchChainReceipt(txHash, wallet)).success, true);
    assert.equal((await fetchChainReceipt("", wallet)).ok, false);
    globalThis.fetch = async () => Response.json({}, { status: 500 });
    assert.equal((await fetchChainReceipt(txHash, wallet)).ok, false);
    globalThis.fetch = async () => { throw new Error("timeout"); };
    assert.equal((await fetchChainReceipt(txHash, wallet)).ok, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("SQL gives concurrent claimed sends one winner, guards terminal attempts, and confirms atomically", async () => {
  const db = new PGlite();
  const sql: Sql = Object.assign(async <T>(strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, "");
    return (await db.query<T>(text, params)).rows;
  }, { query: async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params)).rows });
  try {
    await db.exec(readFileSync(new URL("../../../migrations/0002_maintpay.sql", import.meta.url), "utf8"));
    const job = await fixture();
    await db.query(`insert into jobs (id, client_user_id, client_email, worker_email, approver_email, repository, task, criteria, recipient, amount_yocto, expires_at, wallet_address, status, terms_hash)
      values ('job','client','client@demo.maintpay','worker@demo.maintpay','approver@demo.maintpay','org/repo','task','criteria','recipient.testnet','10000000000000000000000',now()+interval '1 day',$1,'payment_in_flight','terms')`, [wallet]);
    await db.query(`insert into attempts (id,job_id,provider,wallet_address,request_body,body_hash,idempotency_key,state) values ('attempt','job','outlayer',$1,$2,$3,'same-stored-key','claimed')`, [wallet, body, job.attempt!.bodyHash]);
    const wins = await Promise.all([beginSending(sql, job), beginSending(sql, job)]);
    assert.equal(wins.filter(Boolean).length, 1);
    job.version += 1;
    job.attempt!.state = "sending";
    const unknown = { ...interpretProvider({ http: 0 }), state: "sending" as const, plain: UNKNOWN_SEND };
    assert.equal(await persistProvider(sql, job, unknown), true);
    assert.equal(await persistProvider(sql, job, unknown), false);
    job.version += 1;
    assert.equal(await beginSending(sql, job), true);
    job.version += 1;
    const success = interpretProvider({ http: 200, status: "success", request_id: "original", tx_hash: txHash });
    assert.equal(await persistProvider(sql, job, success), true);
    job.version += 1;
    job.attempt!.state = "awaiting_chain";
    job.attempt!.txHash = txHash;
    assert.equal(await persistConfirmation(sql, { ...job, version: 1 }), false);
    assert.equal(await persistConfirmation(sql, job), true);
    assert.equal(await persistConfirmation(sql, job), false);
    assert.deepEqual((await db.query("select jobs.status, attempts.state from jobs join attempts on attempts.job_id=jobs.id")).rows, [{ status: "confirmed", state: "confirmed" }]);
    assert.equal((await db.query("select * from job_events where title='Paid on chain'")).rows.length, 1);
    for (const state of ["confirmed", "failed_unproven"] as const) {
      await db.query("update attempts set state=$1", [state]);
      job.attempt!.state = state;
      assert.equal(await beginSending(sql, job), false);
      await db.query("update jobs set status='payment_in_flight', version=$1", [job.version]);
      assert.equal(await beginSending(sql, { ...job, attempt: { ...job.attempt!, state: "claimed" } }), false);
    }
    const stored = (await db.query<{ request_body: string; idempotency_key: string }>("select request_body, idempotency_key from attempts")).rows[0];
    assert.equal(stored.request_body, body);
    assert.equal(stored.idempotency_key, "same-stored-key");
  } finally {
    await db.close();
  }
});
