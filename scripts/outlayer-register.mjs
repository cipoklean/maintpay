import { isMainModule } from "./with-app-env.mjs";

export async function registerWallet(base = "https://testnet-api.outlayer.ai", fetchImpl = fetch) {
  const response = await fetchImpl(`${base.replace(/\/+$/, "")}/register`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`OutLayer registration failed (HTTP ${response.status}).`);
  const body = await response.json();
  if (!/^[0-9a-f]{64}$/.test(body?.near_account_id) || !/^wk_[A-Za-z0-9_-]+$/.test(body?.api_key)) throw new Error("OutLayer returned an invalid registration.");
  return { near_account_id: body.near_account_id, api_key: body.api_key };
}

if (isMainModule(import.meta.url)) {
  registerWallet(process.env.OUTLAYER_API_BASE).then((wallet) => {
    console.log("Save this API credential securely outside the repo. It authorizes spending; it is shown only once. Set a recipient whitelist and cap at https://app.outlayer.ai/wallet?key=… before funding.");
    console.log(`near_account_id: ${wallet.near_account_id}`);
    console.log(`api_key: ${wallet.api_key}`);
  }).catch(() => {
    console.error("OutLayer registration failed. No credential was saved; check the network and API base.");
    process.exitCode = 1;
  });
}
