import assert from "node:assert/strict";
import { test } from "node:test";
import { registerWallet } from "./outlayer-register.mjs";

test("registration uses the testnet host and validates credentials without writing files", async () => {
  const wallet = { near_account_id: "a".repeat(64), api_key: "wk_test" };
  assert.deepEqual(await registerWallet(undefined, async (url, init) => {
    assert.equal(url, "https://testnet-api.outlayer.ai/register");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    return Response.json(wallet);
  }), wallet);
  await assert.rejects(registerWallet(undefined, async () => Response.json({})), /invalid/);
  await assert.rejects(registerWallet(undefined, async () => new Response(null, { status: 503 })), /503/);
});
