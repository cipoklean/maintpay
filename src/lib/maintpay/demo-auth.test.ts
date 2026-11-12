import assert from "node:assert/strict";
import { test } from "node:test";
import { demoAutoVerifyEnabled } from "../auth/demo.ts";
import { emailAndPasswordEnabled } from "../auth/email-password.ts";

test("email/password is enabled but demo verification requires explicit opt-in", () => {
  assert.equal(emailAndPasswordEnabled, true);
  assert.equal(demoAutoVerifyEnabled({}), false);
  for (const value of ["", "false", "TRUE", "1"]) {
    assert.equal(demoAutoVerifyEnabled({ MAINTPAY_DEMO_AUTO_VERIFY: value }), false);
  }
  assert.equal(demoAutoVerifyEnabled({ MAINTPAY_DEMO_AUTO_VERIFY: "true" }), true);
});
