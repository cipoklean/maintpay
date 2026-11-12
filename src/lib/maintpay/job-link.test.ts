import assert from "node:assert/strict";
import { test } from "node:test";
import { emailLoginSearch, isJobId, jobPath, safeReturnPath, shareJobUrl } from "./job-link.ts";

test("a job link accepts only an agreement id", () => {
  assert.equal(isJobId("MP-1042"), true);
  assert.equal(isJobId("MP-a1b2c3d4"), true);
  assert.equal(jobPath("MP-a1b2c3d4"), "/job/MP-a1b2c3d4");
  for (const bad of ["", "MP-", "job", "../MP-1042", "MP-1042/extra", "https://evil.example/job"]) {
    assert.equal(isJobId(bad), false);
  }
});

test("the shared url is the path that will be opened, with nothing extra", () => {
  const url = shareJobUrl("MP-a1b2c3d4", {
    origin: "https://maintpay.example",
    hostname: "maintpay.example",
    pathname: "/",
  });
  assert.equal(url, "https://maintpay.example/job/MP-a1b2c3d4");
  assert.equal(url.includes("?"), false);
  assert.equal(url.includes("#"), false);
});

test("sign-in may return only to the dashboard or that agreement", () => {
  assert.equal(safeReturnPath("/job/MP-a1b2c3d4"), "/job/MP-a1b2c3d4");
  assert.equal(safeReturnPath("/"), "/");
  assert.equal(safeReturnPath("//evil.example"), "/");
  assert.equal(safeReturnPath("/job/MP-a1b2c3d4?next=https://evil.example"), "/");
  assert.equal(safeReturnPath("/login"), "/");
});

test("email login preserves only a validated agreement return path", () => {
  const path = "/job/MP-a1b2c3d4";
  const search = emailLoginSearch(path);
  assert.deepEqual(search, { returnTo: path });
  assert.equal(safeReturnPath(new URLSearchParams(new URLSearchParams(search).toString()).get("returnTo")), path);
  for (const value of [undefined, null, "", "/", "/login", "//evil.example", "https://evil.example", "/job/MP-a1b2c3d4?next=//evil.example", "/job/MP-a1b2c3d4#secret", "/\\evil.example", "/job/not-a-job"]) {
    assert.deepEqual(emailLoginSearch(value), {});
  }
});
