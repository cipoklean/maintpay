import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SAMPLE_BANNER, sampleChapters, sampleWalk, isIllustrativeJob } from "./sample.ts";

const text = JSON.stringify(sampleWalk);

test("the sample is labeled illustrative and read-only", () => {
  assert.equal(sampleWalk.readOnly, true);
  assert.equal(SAMPLE_BANNER, "Illustrative example — no payment was made.");
  assert.deepEqual([...sampleChapters], ["Client", "Contributor", "Approver", "Decision"]);
  assert.equal(sampleWalk.contributor.pullRequest.verified, false);
  assert.match(sampleWalk.contributor.pullRequest.detail, /Not fetched from GitHub/);
  assert.match(sampleWalk.confirmation.intro, /Nothing in this example was paid/);
});

test("the contributor warning comes before the sample pull request", () => {
  const warningAt = text.indexOf(sampleWalk.contributor.warning);
  const pullAt = text.indexOf(sampleWalk.contributor.pullRequest.title);
  assert.ok(warningAt >= 0 && pullAt > warningAt);
  assert.match(sampleWalk.contributor.warning, /withdraw/);
  assert.match(sampleWalk.client.warning, /not escrow/);
});

test("changed-head and unknown results are held, and unknown does not claim the funds stayed", () => {
  const changed = sampleWalk.held.find((item) => item.title.includes("changed"));
  const unknown = sampleWalk.held.find((item) => item.title.includes("unknown"));
  assert.ok(changed);
  assert.ok(unknown);
  assert.notEqual(changed.reason, unknown.reason);
  assert.match(changed.title, /^Held/);
  assert.match(unknown.title, /^Held/);
  assert.match(unknown.next, /do not assume the money is still in the wallet/i);
  assert.doesNotMatch(unknown.reason + unknown.next, /safely still|funds are safe|money is safe/i);
});

test("the sample invents no receipt, hash, or paid status", () => {
  assert.doesNotMatch(text, /\bPaid\b/);
  assert.doesNotMatch(text, /\bsettled\b/i);
  assert.doesNotMatch(text, /[0-9a-f]{40}/);
  assert.doesNotMatch(text, /[1-9A-HJ-NP-Za-km-z]{43,}/);
  assert.equal("txHash" in sampleWalk, false);
});

test("the public sample does not call job or payment code", () => {
  const sample = readFileSync(new URL("./sample.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../routes/sample.tsx", import.meta.url), "utf8");
  const view = readFileSync(new URL("../../components/maintpay/sample-walk.tsx", import.meta.url), "utf8");
  for (const source of [sample, route, view]) {
    assert.doesNotMatch(source, /claimAttempt|cancelJob|createJob|readBalance|checkDeposit|fetch\(|outlayer|useServerFn/);
  }
});

test("sample agreement data is marked illustrative", () => {
  assert.equal(
    isIllustrativeJob({
      id: "MP-1",
      repository: "sample-org/storage-notes",
      recipient: "example-worker.testnet",
      workerEmail: "contributor@example.com",
      approverEmail: "approver@example.com",
    }),
    true,
  );
  assert.equal(
    isIllustrativeJob({
      id: "MP-9",
      repository: "TestSprite/testsprite-cli",
      recipient: "worker.near",
      workerEmail: "worker@example.com",
      approverEmail: "approver@example.com",
    }),
    false,
  );
});
