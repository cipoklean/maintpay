import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

function statement(handler: string, marker: string, values: Record<string, unknown>) {
  const body = source.split(`export const ${handler} =`)[1].split("export const ")[0];
  const sql = [...body.matchAll(/sql(?:<[^`]+>)?`([\s\S]*?)`/g)].map((match) => match[1]).find((text) => text.includes(marker));
  assert.ok(sql, `${handler}: SQL statement exists`);
  const params: unknown[] = [];
  const text = sql.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    assert.ok(Object.hasOwn(values, expression), expression);
    params.push(values[expression]);
    return `$${params.length}`;
  });
  return { text, params };
}

test("production SQL prevents resurrection, duplicate funding and stale decisions", async () => {
  const db = new PGlite();
  try {
    for (const file of ["0002_maintpay.sql", "0003_funding_reservations.sql"]) {
      await db.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
    }
    const create = (id: string, wallet = "a".repeat(64)) => db.query(`
      insert into jobs (id, client_user_id, client_email, approver_email, worker_email, repository, task, criteria,
        recipient, amount_yocto, expires_at, wallet_address, status, terms_hash)
      values ($1, 'client', 'client@test.dev', 'approver@test.dev', 'worker@test.dev', 'org/repo', 'task', 'criteria',
        'worker.testnet', '1', now() + interval '1 day', $2, 'agreed', 'hash')`, [id, wallet]);
    await create("first");
    await assert.rejects(create("second"), (error: { code: string }) => error.code === "23505");
    await db.exec("update jobs set status = 'cancelled' where id = 'first'");
    await create("second");
    await db.exec("insert into funding (id, job_id, kind, amount_yocto, tx_hash) values ('original', 'first', 'deposit', '2', 'receipt')");
    const values: Record<string, unknown> = {
      "job.id": "second", "job.version": 1, "job.status": "agreed", next: "funding_observed",
      "crypto.randomUUID()": "funding", "checked.deposit": "2", "data.txHash.trim()": "receipt",
      "data.sender.trim().toLowerCase()": "sender.testnet",
      "loaded.pull.number": 1, "loaded.pull.htmlUrl": "https://github.com/org/repo/pull/1",
      "loaded.pull.headSha": "a".repeat(40), "loaded.pull.state": "open", "loaded.pull.title": "title", status: "pr_ready",
      "result.job.status": "accepted", "me.userId": "approver", "me.email": "approver@test.dev",
      "data.decision": "accepted", "decision.headSha": "a".repeat(40), "decision.termsHash": "hash",
    };
    const run = (handler: string, marker: string) => {
      const query = statement(handler, marker, values);
      return db.query(query.text, query.params);
    };
    await assert.rejects(run("checkDeposit", "with updated"), (error: { code: string }) => error.code === "23505");
    assert.deepEqual((await db.query("select status, version from jobs where id = 'second'")).rows, [{ status: "agreed", version: 1 }]);
    values["data.txHash.trim()"] = "different-receipt";
    assert.equal((await run("checkDeposit", "with updated")).rows.length, 1);
    for (const status of ["cancelled", "held", "rejected", "accepted", "payment_in_flight", "confirmed"]) {
      await db.query("update jobs set status = $1, version = 10 where id = 'second'", [status]);
      values["job.version"] = 10;
      values["job.status"] = status;
      assert.equal((await run("linkPull", "pr_number =")).rows.length, 0, status);
      assert.equal((await run("checkDeposit", "with updated")).rows.length, 0, status);
    }
    await db.exec("update jobs set status = 'in_review', version = 11 where id = 'second'");
    assert.equal((await run("review", "with updated")).rows.length, 0);
    assert.equal((await db.query("select * from decisions")).rows.length, 0);
    values["job.version"] = 11;
    values["decision.termsHash"] = null;
    await assert.rejects(run("review", "with updated"));
    assert.equal((await db.query<{ status: string }>("select status from jobs where id = 'second'")).rows[0].status, "in_review");
    values["decision.termsHash"] = "hash";
    assert.equal((await run("review", "with updated")).rows.length, 1);
    assert.equal((await db.query<{ status: string }>("select status from jobs where id = 'second'")).rows[0].status, "accepted");
    assert.equal((await db.query("select * from decisions")).rows.length, 1);
    assert.equal((await run("review", "with updated")).rows.length, 0);
  } finally {
    await db.close();
  }
});
