# MaintPay

Agree the work. A different person accepts that exact commit. The client authorizes one stored payment attempt through OutLayer testnet. Only a matching final NEAR chain receipt marks it Paid.

This is a revocable reservation, not escrow. The client controls the dedicated NEAR testnet wallet and can move the funds until a payment is actually submitted.

## What you can do

- Sign in and write the agreement. The account and wallet are shown exactly as they will be saved before you confirm them.
- Copy a link for the contributor and the approver. Only those emails, plus the client, can open it.
- The contributor links a public GitHub pull request. The approver accepts or rejects that exact commit.
- The client can read a testnet balance, check a deposit, or cancel before an attempt exists.
- After acceptance, the client stores one attempt, then pastes an OutLayer API credential per send/status action. The server verifies the credential controls the agreed wallet before sending the exact stored body and idempotency key.
- Provider success is followed by final on-chain verification. Only the agreed signer, recipient, amount and transaction can mark the attempt and job confirmed.

The public sample at `/sample` is an illustration. It is labeled “Illustrative example — no payment was made.”

## What this build does not do

- It does not provide escrow or guarantee the client leaves funds available.
- A balance reading, a stored attempt, or a provider success without a matching chain receipt is not paid.
- It does not infer payment from earlier unrelated testnet transfers or generate a replacement key for a stored attempt.

## Run it

Node 22.

```bash
npm install
npm run dev
```

The app serves on port 8080. Without `DATABASE_URL`, it uses a local Postgres-compatible database. Set `DATABASE_URL` to use your own Postgres. Migrations are in `migrations/`.

### Local judge demo

```bash
cp .env.example .env  # optional; edit server credentials here
npm run dev
# In another terminal, with the server still running:
npm run demo:seed
```

Open http://localhost:8080/login and use the email/password form to sign up with any email, or sign in as `client@demo.maintpay`, `worker@demo.maintpay`, or `approver@demo.maintpay`. The seed prints their password: `DEMO_PASSWORD`, default `MaintPay-demo-2026!`. It is idempotent and does not reset existing passwords. Use separate browser profiles for the three roles.

The seed uses the running server's normal auth endpoints, so it shares that server's PGLite fallback or `DATABASE_URL`; it does not create a separate throwaway database. Start the server first. In-memory PGLite loses users/jobs on restart: run the seed again. Set `BETTER_AUTH_URL` for a server at a different origin. Existing unverified accounts are not silently promoted by seeding.

`npm run dev` defaults `MAINTPAY_DEMO_AUTO_VERIFY=true` only outside Vercel/production. This marks newly created users verified without sending email, including arbitrary local signups. Set it to `false` to disable. This is **demo-only**, not email ownership verification. Build/preview/production default to off; an explicit `true` opts in even there. Never enable it for real users. No real verification email sender is configured, so with demo mode off email/password accounts cannot act on jobs until a trusted verification flow is configured. Verified OAuth identities can act normally.

Production requires a persistent `DATABASE_URL`, stable random `BETTER_AUTH_SECRET`, and public HTTPS `BETTER_AUTH_URL`. Set `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, and `GROK_AUTH_CLIENT_SECRET` for OAuth with a broker client registered for the deployed callback URLs. Vercel itself does not select credentials: absent overrides, the server falls back to shared sandbox-preview OAuth credentials, which are not a production setup. Leave `VITE_AUTH_ENABLED` unset or `true`; never use the auth-off development bypass in production. `GITHUB_TOKEN` is optional and server-only. `.env` is ignored; `.env.example` documents local settings and is not a production configuration.

Sign-in is on unless `VITE_AUTH_ENABLED` is `false`. A deployed app needs its own auth client (`GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`). Do not commit secrets, wallet keys, or idempotency keys.

```bash
npm test
npm run typecheck
npm run build
```

## Safety rules that stay in the code

- The browser never holds the wallet private key; it stays in OutLayer's TEE. The browser temporarily holds the spending API credential the client pastes per action. The app never persists or logs it, and clears the input after the action.
- One immutable attempt body and idempotency key are stored before any send. A SHA-256 integrity check precedes sending.
- Cancellation and a payment attempt cannot both win.
- A changed or missing pull request holds the job.
- A duplicate response is not a payment.
- An unknown result is not a reason to create another attempt.

## Send a testnet payment

Run `npm run outlayer:register` once to get a dedicated wallet address and API credential. The script prints both and writes no files: save the credential securely outside the repository and logs. Never put it in a job, environment variable, URL shared with MaintPay, or chat. Set an OutLayer recipient whitelist and spending cap at `https://app.outlayer.ai/wallet?key=…`, substituting the credential locally in your browser. Fund the implicit account on NEAR testnet, allowing for the payment plus gas.

Create the agreement with that wallet, check its inbound deposit, link a public non-draft PR, and accept as the separate approver. As the client, store the attempt, paste the API credential, and select **Send payment**. `OUTLAYER_API_BASE` defaults to `https://testnet-api.outlayer.ai`; this demo uses testnet only. No wallet API credential is configured on the server.

If a send times out, state stays `sending`. **Send payment** re-sends the identical stored body with the same idempotency key, which OutLayer deduplicates by wallet/key. It never generates a new key. A duplicate response points to the original request, not proof of payment: use **Check status** with the credential. Policy approval, review, unknown status and wallet-busy responses block new sends. A failure remains `failed_unproven`; even when the provider says it never executed/submitted, this app does not reopen the attempt.

Successful send/status responses automatically check a final NEAR RPC receipt. If finality is not available yet, use **Confirm on chain** (no credential needed). The **Paid** link leads to the confirmed testnet Nearblocks transaction. Other participants see read-only status.
