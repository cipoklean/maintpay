import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReading, validateAgreement, type AgreementInput } from "./form-ui.ts";

const blank: AgreementInput = {
  task: "",
  criteria: "",
  repository: "",
  worker: "",
  approver: "",
  recipient: "",
  amount: "",
  expiry: "",
  wallet: "",
  walletChecked: false,
  recipientChecked: false,
  clientEmail: "client@example.com",
};

test("an empty agreement names each missing field instead of one browser tooltip", () => {
  const errors = validateAgreement(blank);
  assert.match(errors.task ?? "", /needs doing/);
  assert.match(errors.criteria ?? "", /know it is done/);
  assert.match(errors.repository ?? "", /owner\/name/);
  assert.match(errors.worker ?? "", /contributor/i);
  assert.match(errors.approver ?? "", /approver/i);
  assert.match(errors.recipient ?? "", /NEAR account/);
  assert.match(errors.amount ?? "", /greater than zero/);
  assert.match(errors.expiry ?? "", /expires/);
  assert.match(errors.wallet ?? "", /wallet address/);
  assert.equal(errors.walletCheck, undefined);
});

test("a hex address must be checked before save", () => {
  const wallet = "ab".repeat(32);
  const errors = validateAgreement({
    ...blank,
    task: "Fix the storage check",
    criteria: "The empty account fails closed",
    repository: "sample-org/notes",
    worker: "worker@example.com",
    approver: "approver@example.com",
    recipient: "sample.near",
    amount: "0.1",
    expiry: "2099-01-01",
    wallet,
    recipientChecked: true,
    walletChecked: false,
  });
  assert.match(errors.walletCheck ?? "", /Check this/);
  assert.equal(errors.wallet, undefined);
});

test("check this matches the saved string for an account and a hex address", () => {
  const account = checkReading("Example-Worker.Testnet");
  assert.equal(account.kind, "near");
  assert.equal(account.shown.replace(/\s+/g, ""), account.stored);
  assert.equal(account.stored, "example-worker.testnet");
  assert.equal(account.shown, "example-worker.testnet");

  const hex = checkReading("AB".repeat(32));
  assert.equal(hex.kind, "hex");
  assert.equal(hex.shown.replace(/\s+/g, ""), hex.stored);
  assert.equal(hex.stored, "ab".repeat(32));
  for (const group of hex.shown.split(" ")) assert.equal(group.length, 4);
});
