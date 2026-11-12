import { isMainModule } from "./with-app-env.mjs";

export const DEMO_EMAILS = ["client@demo.maintpay", "worker@demo.maintpay", "approver@demo.maintpay"];
export const DEFAULT_DEMO_PASSWORD = "MaintPay-demo-2026!";

export async function seedDemo({ baseURL = "http://localhost:8080", password = DEFAULT_DEMO_PASSWORD, fetchImpl = fetch, log = console.log } = {}) {
  const origin = new URL(baseURL).origin;
  if (password.length < 8) throw new Error("DEMO_PASSWORD must contain at least 8 characters.");
  async function post(path, body) {
    const response = await fetchImpl(`${origin}/api/auth/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
    });
    return { response, body: await response.json() };
  }
  for (const email of DEMO_EMAILS) {
    const signup = await post("sign-up/email", { email, password, name: email.split("@")[0] });
    const result = signup.response.ok ? signup : await post("sign-in/email", { email, password });
    if (!result.response.ok) throw new Error(`${email}: ${result.body.message ?? "Sign-in failed; check DEMO_PASSWORD and the running server."}`);
    if (result.body.user?.emailVerified !== true) throw new Error(`${email} is not verified. Use a fresh demo database with MAINTPAY_DEMO_AUTO_VERIFY=true; existing unverified users are not promoted.`);
    log(`${email}: verified (${signup.response.ok ? "created" : "already exists"})`);
  }
  log(`Demo password: ${password}`);
}

if (isMainModule(import.meta.url)) {
  seedDemo({ baseURL: process.env.BETTER_AUTH_URL, password: process.env.DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD }).catch((error) => {
    console.error(`[demo:seed] ${error.message}`);
    process.exitCode = 1;
  });
}
