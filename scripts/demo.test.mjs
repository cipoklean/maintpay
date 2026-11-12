import assert from "node:assert/strict";
import { test } from "node:test";
import { demoDevEnv } from "./demo-dev.mjs";
import { seedDemo } from "./demo-seed.mjs";

test("only the local dev command defaults to demo verification", () => {
  assert.equal(demoDevEnv({}).MAINTPAY_DEMO_AUTO_VERIFY, "true");
  for (const env of [{ VERCEL: "1" }, { NODE_ENV: "production" }, { MAINTPAY_DEMO_AUTO_VERIFY: "false" }]) {
    assert.equal(demoDevEnv(env).MAINTPAY_DEMO_AUTO_VERIFY, "false");
  }
  assert.equal(demoDevEnv({ VERCEL: "1", MAINTPAY_DEMO_AUTO_VERIFY: "true" }).MAINTPAY_DEMO_AUTO_VERIFY, "true");
});

test("seed creates users and signs in on repeat without changing passwords", async () => {
  const existing = new Set();
  const logs = [];
  const fetchImpl = async (url, init) => {
    const { email } = JSON.parse(init.body);
    assert.equal(init.headers.Origin, "http://localhost:8080");
    if (url.endsWith("sign-up/email") && existing.has(email)) return Response.json({}, { status: 422 });
    existing.add(email);
    return Response.json({ user: { emailVerified: true } });
  };
  await seedDemo({ fetchImpl, log: (line) => logs.push(line) });
  await seedDemo({ fetchImpl, log: (line) => logs.push(line) });
  assert.equal(existing.size, 3);
  assert.equal(logs.filter((line) => line.includes("already exists")).length, 3);
});

test("seed refuses short passwords, unverified users and authentication errors", async () => {
  await assert.rejects(seedDemo({ password: "", log() {} }), /at least 8/);
  await assert.rejects(seedDemo({ fetchImpl: async () => Response.json({ user: { emailVerified: false } }), log() {} }), /not verified/);
  await assert.rejects(seedDemo({ fetchImpl: async () => Response.json({ message: "Invalid credentials" }, { status: 401 }), log() {} }), /Invalid credentials/);
});
