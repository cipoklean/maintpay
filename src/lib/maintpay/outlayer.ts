import { TRANSFER_PATH, type Attempt, type ProviderBody } from "./control.ts";

export function outlayerBase() {
  return (process.env.OUTLAYER_API_BASE || "https://testnet-api.outlayer.ai").replace(/\/+$/, "");
}

export async function checkWalletKey(apiKey: string, wallet: string): Promise<string | null> {
  if (!/^wk_[A-Za-z0-9_-]{16,256}$/.test(apiKey)) return "Enter an OutLayer API key (wk_…).";
  try {
    const response = await fetch(`${outlayerBase()}/wallet/v1/address?chain=near`, {
      headers: { Authorization: `Bearer ${apiKey}` }, redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return "OutLayer could not verify that key. Nothing was sent.";
    const body = await response.json();
    return body?.address === wallet ? null : "That key controls a different wallet.";
  } catch {
    return "OutLayer could not verify that key. Nothing was sent.";
  }
}

export async function requestOutlayer(apiKey: string, attempt: Attempt, action: "send" | "refresh"): Promise<ProviderBody | null> {
  try {
    const response = await fetch(`${outlayerBase()}${action === "send" ? TRANSFER_PATH : `/wallet/v1/requests/${encodeURIComponent(attempt.providerRequestId!)}`}`, {
      method: action === "send" ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(action === "send" ? { "Content-Type": "application/json", "X-Idempotency-Key": attempt.idempotencyKey } : {}),
      },
      ...(action === "send" ? { body: attempt.requestBody } : {}),
      redirect: "manual", signal: AbortSignal.timeout(100000),
    });
    const raw = await response.json();
    if (!raw || typeof raw !== "object") return null;
    const safeId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value) && !value.includes("wk_") ? value : undefined;
    const hash = (value: unknown) => typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(value) ? value : undefined;
    return {
      http: response.status,
      error: typeof raw.error === "string" ? (["duplicate_idempotency_key", "wallet_busy", "failed"].includes(raw.error) ? raw.error : "provider_error") : undefined,
      request_id: safeId(raw.request_id), in_flight_request_id: safeId(raw.in_flight_request_id),
      status: ["success", "failed", "processing", "pending_approval", "needs_review"].includes(raw.status) ? raw.status : "unknown",
      tx_hash: hash(raw.tx_hash) ?? hash(raw.result?.tx_hash),
      result: { never_executed: raw.result?.never_executed === true, never_submitted: raw.result?.never_submitted === true },
    };
  } catch {
    return null;
  }
}
