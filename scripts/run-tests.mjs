import { spawnSync } from "node:child_process";
import { isMainModule } from "./with-app-env.mjs";

export function runTestPhases(run = spawnSync) {
  const phases = [
    ["--test", "scripts/**/*.test.mjs"],
    [
      "--experimental-strip-types", "--test",
      "src/lib/app-data/app-data.test.ts",
      "src/lib/app-data/readiness-schedule.test.ts",
      "src/lib/auth/gate-identity.test.ts",
      "src/lib/auth/sign-in-gate.test.ts",
      "src/lib/preview-path-prefix.test.ts",
      "src/lib/maintpay/*.test.ts",
    ],
  ];
  let failed = false;
  for (const args of phases) {
    const result = run(process.execPath, args, { stdio: "inherit" });
    if (result.error) console.error(result.error);
    if (result.status !== 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exitCode = runTestPhases();
