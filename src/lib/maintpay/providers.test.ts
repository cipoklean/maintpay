import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicPull } from "./github.ts";
import { readNativeBalance, verifyInbound } from "./near.ts";

test("GitHub credentials are optional and only sent to the API", async () => {
  const original = globalThis.fetch;
  const token = process.env.GITHUB_TOKEN;
  try {
    for (const value of [undefined, "local-test-token"]) {
      if (value) process.env.GITHUB_TOKEN = value;
      else delete process.env.GITHUB_TOKEN;
      globalThis.fetch = async (url, init) => {
        assert.equal(url, "https://api.github.com/repos/org/repo/pulls/1");
        assert.equal(new Headers(init?.headers).get("Authorization"), value ? `Bearer ${value}` : null);
        return Response.json({ head: { sha: "a".repeat(40), ref: "branch" }, user: { login: "worker" }, base: { repo: { full_name: "org/repo" } }, number: 1, html_url: "https://github.com/org/repo/pull/1", state: "open" });
      };
      assert.equal((await fetchPublicPull("https://github.com/org/repo/pull/1")).ok, true);
    }
    assert.equal((await fetchPublicPull("")).ok, false);
    globalThis.fetch = async () => Response.json({}, { status: 403 });
    assert.equal((await fetchPublicPull("https://github.com/org/repo/pull/1")).ok, false);
  } finally {
    globalThis.fetch = original;
    if (token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = token;
  }
});

test("deposit verification waits for FINAL and validates the actual native transfer", async () => {
  const original = globalThis.fetch;
  const wallet = "a".repeat(64);
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.params.wait_until, "FINAL");
      return Response.json({ result: { transaction: { signer_id: "sender.testnet", receiver_id: wallet, actions: [{ Transfer: { deposit: "123" } }] }, status: { SuccessValue: "" } } });
    };
    assert.deepEqual(await verifyInbound("A".repeat(44), "sender.testnet", wallet), { ok: true, deposit: "123" });
    assert.equal((await verifyInbound("", "sender.testnet", wallet)).ok, false);
    assert.equal((await verifyInbound("A".repeat(44), "other.testnet", wallet)).ok, false);
    globalThis.fetch = async () => Response.json({ error: "missing" });
    assert.equal((await verifyInbound("A".repeat(44), "sender.testnet", wallet)).ok, false);
    assert.equal((await readNativeBalance(wallet)).ok, false);
  } finally {
    globalThis.fetch = original;
  }
});
