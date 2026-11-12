export type WalletBalance = { ok: true; yocto: string; blockHeight: number } | { ok: false; error: string };

const RPC = "https://rpc.testnet.near.org";

export async function readNativeBalance(accountId: string): Promise<WalletBalance> {
  if (!/^[0-9a-f]{64}$/.test(accountId)) return { ok: false, error: "That is not a dedicated wallet address." };
  let response: Response;
  try {
    response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "maintpay",
        method: "query",
        params: { request_type: "view_account", finality: "final", account_id: accountId },
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: "Testnet did not answer. Claiming stays blocked." };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, error: "Testnet redirected that request. It was not used." };
  }
  if (!response.ok) return { ok: false, error: "Testnet did not return the wallet. Claiming stays blocked." };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "Testnet returned something that was not a balance." };
  }
  return readBalance(body);
}

function readBalance(body: unknown): WalletBalance {
  if (!body || typeof body !== "object") return { ok: false, error: "Testnet returned something that was not a balance." };
  const row = body as Record<string, unknown>;
  if (row.error) return { ok: false, error: "That wallet has no testnet balance. It is not reserved." };
  const result = row.result;
  if (!result || typeof result !== "object") return { ok: false, error: "Testnet returned something that was not a balance." };
  const amount = (result as Record<string, unknown>).amount;
  const height = (result as Record<string, unknown>).block_height;
  if (typeof amount !== "string" || !/^\d{1,40}$/.test(amount)) return { ok: false, error: "Testnet did not return a balance." };
  if (typeof height !== "number" || !Number.isInteger(height) || height < 0) {
    return { ok: false, error: "Testnet did not name the block for that balance." };
  }
  return { ok: true, yocto: amount, blockHeight: height };
}

export async function verifyInbound(
  txHash: string,
  sender: string,
  wallet: string,
): Promise<{ ok: true; deposit: string } | { ok: false; error: string }> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(txHash)) return { ok: false, error: "That is not a transaction hash." };
  let response: Response;
  try {
    response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "maintpay",
        method: "EXPERIMENTAL_tx_status",
        params: { tx_hash: txHash, sender_account_id: sender, wait_until: "NONE" },
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: "Testnet did not answer." };
  }
  if (!response.ok) return { ok: false, error: "Testnet did not return that transaction." };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "Testnet returned something that was not a transaction." };
  }
  if (!body || typeof body !== "object") return { ok: false, error: "Testnet returned something that was not a transaction." };
  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object") return { ok: false, error: "That transaction was not found." };
  const tx = (result as { transaction?: unknown }).transaction;
  const status = (result as { status?: unknown }).status;
  if (!tx || typeof tx !== "object") return { ok: false, error: "That transaction was not found." };
  const signer = (tx as { signer_id?: unknown }).signer_id;
  const receiver = (tx as { receiver_id?: unknown }).receiver_id;
  const actions = (tx as { actions?: unknown }).actions;
  const success = Boolean(status && typeof status === "object" && "SuccessValue" in status);
  if (signer !== sender || receiver !== wallet || !success || !Array.isArray(actions)) {
    return { ok: false, error: "That transaction is not a successful payment into this wallet." };
  }
  const transfer = actions.find((action) => action && typeof action === "object" && "Transfer" in action) as
    | { Transfer?: { deposit?: unknown } }
    | undefined;
  const deposit = transfer?.Transfer?.deposit;
  if (typeof deposit !== "string" || !/^\d+$/.test(deposit)) {
    return { ok: false, error: "That transaction is not a native NEAR transfer." };
  }
  return { ok: true, deposit };
}
