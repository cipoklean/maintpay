# MaintPay

Agree the work. A different person accepts that exact commit. MaintPay can store one payment attempt. It does not send the money.

This is a revocable reservation, not escrow. The client keeps the dedicated NEAR testnet wallet and can move the funds until a payment is actually submitted. This repository does not submit that payment.

## What you can do

- Sign in and write the agreement. The account and wallet are shown exactly as they will be saved before you confirm them.
- Copy a link for the contributor and the approver. Only those emails, plus the client, can open it.
- The contributor links a public GitHub pull request. The approver accepts or rejects that exact commit.
- The client can read a testnet balance, check a deposit, or cancel before an attempt exists.
- After acceptance, the client can store one attempt. The app stops there. A stored attempt is not a payment.

The public sample at `/sample` is an illustration. It is labeled “Illustrative example — no payment was made.”

## What this build does not do

- It does not send NEAR.
- A balance reading, a stored attempt, or a provider success without a matching chain receipt is not paid.
- Two earlier testnet transfers exist. Whether they used the same idempotency header is unknown. That is not treated as safe, and this app will not send another transfer to find out.

## Run it

Node 22.

```bash
npm install
npm run dev
```

The app serves on port 8080. Without `DATABASE_URL`, it uses a local Postgres-compatible database. Set `DATABASE_URL` to use your own Postgres. Migrations are in `migrations/`.

Sign-in is on unless `VITE_AUTH_ENABLED` is `false`. A deployed app needs its own auth client (`GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`). Do not commit secrets, wallet keys, or idempotency keys.

```bash
npm test
npm run typecheck
npm run build
```

## Safety rules that stay in the code

- The browser never holds the wallet key.
- One attempt is stored before any send, and this build does not perform the send.
- Cancellation and a payment attempt cannot both win.
- A changed or missing pull request holds the job.
- A duplicate response is not a payment.
- An unknown result is not a reason to create another attempt.
