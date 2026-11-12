import { spawnSync } from "node:child_process";
import { isMainModule } from "./with-app-env.mjs";

export function demoDevEnv(env) {
  return {
    ...env,
    MAINTPAY_DEMO_AUTO_VERIFY: env.MAINTPAY_DEMO_AUTO_VERIFY ??
      (env.VERCEL || env.NODE_ENV === "production" ? "false" : "true"),
  };
}

if (isMainModule(import.meta.url)) {
  const result = spawnSync(process.execPath, ["scripts/with-app-env.mjs", "vite", "dev", "--host", "0.0.0.0", "--port", "8080", ...process.argv.slice(2)], {
    env: demoDevEnv(process.env), stdio: "inherit",
  });
  if (result.error) console.error(result.error);
  process.exitCode = result.status ?? 1;
}
