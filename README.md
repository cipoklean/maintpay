# MaintPay

**Review-gated contractor payouts on NEAR testnet: one stored attempt, one idempotency key, and a final chain receipt before “Paid.”**

Live demo: (coming)

Demo video: (coming)

Tracks: **`realworld`** (contractor/maintainer payouts) and **`security`** (scoped wallets, transient credentials, guarded sending and receipt verification).

## Problem

Small maintenance jobs end with two disconnected questions: “was this exact change accepted?” and “was the contributor paid?” A merge, wallet balance or provider success label cannot answer both. Retrying an uncertain payment with a new key can also pay twice.

MaintPay connects a written agreement, human acceptance of a GitHub commit, and a verifiable native NEAR transfer. It is a **revocable reservation, not escrow**: the client can move funds outside the app; acceptance does not lock a balance.

## What it does

1. Client saves the repository, task, criteria, contributor/approver emails, recipient, amount, expiry and dedicated 64-hex wallet.
2. Client reads the balance and records a successful inbound native NEAR deposit.
3. Contributor links a public non-draft PR in the agreed repository. Closed-unmerged PRs are refused; merged PRs remain eligible.
4. Designated approver accepts or rejects the exact linked commit. A merge alone is not acceptance.
5. Client prepares an immutable attempt. Claiming rechecks GitHub evidence and the current balance; changed/missing evidence holds the job.
6. Client pastes an OutLayer API credential for **Send payment**. The server verifies its wallet and the stored body hash, then submits the stored body/key.
7. Success triggers final NEAR receipt verification. Only a matching successful transaction confirms the job and displays **Paid** with an explorer link.

The client can cancel before an attempt exists. Other participants see read-only payment status. `/sample` is explicitly illustrative and never sends money.

## Why NEAR / OutLayer

- **NEAR:** exact integer yoctoNEAR amounts (24 decimals), with testnet RPC `EXPERIMENTAL_tx_status` and `wait_until: "FINAL"`. Confirmation checks final execution, hash, signer, receiver, one native Transfer action and exact amount—not just a provider label.
- **OutLayer:** documented TEE custody keeps the private signing key outside the browser and MaintPay server. A separate `wk_…` spending credential is supplied per action. MaintPay does not independently verify TEE attestation.
- **Idempotent transfer:** OutLayer deduplicates by `(wallet, X-Idempotency-Key)`. Recovery re-sends the stored request/key; a duplicate response points to the original request and is not proof of payment. This is native NEAR transfer, not NEAR Intents or a custom contract.

References: [custody API](https://skills.outlayer.ai/agent-custody/SKILL.md), [idempotency/status semantics](https://skills.outlayer.ai/agent-custody/references/intents-withdraw.md).

## Safety guarantees: mechanisms and boundaries

| Boundary | Concrete mechanism |
| --- | --- |
| Authorized actors | Server auth middleware, same-site checks, verified-email lookup and per-job email roles. Only the client reads balances, claims, sends, refreshes or confirms. The approver cannot be the client or contributor; contributors cannot approve themselves. |
| Fixed acceptance | SHA-256 of canonical terms includes expiry and wallet. Decisions bind the terms hash/head SHA. One guarded SQL CTE updates the job and inserts the decision. |
| No PR/deposit resurrection | Pure lifecycle/expiry guards plus SQL status/version predicates reject cancelled/non-pre-review jobs, decisions and attempts. |
| Wallet and deposit scope | Partial unique indexes prevent active wallet reuse and duplicate deposit transactions. Wallet reuse is allowed after cancellation, confirmation or rejection. There is no on-chain wallet lock. |
| No stored API credential | Password input clears on action. `wk_…` is used in request memory, not saved to the database, browser storage, events or app logs. The private key stays with OutLayer. The registration CLI intentionally prints the API credential for its owner to save securely. |
| Wrong-wallet refusal | `/wallet/v1/address?chain=near` must equal the agreed wallet before sending or status lookup. |
| One attempt; safe recovery | Unique attempt per job, stored body/hash/key, versioned `claimed → sending` SQL transition and integrity check. Concurrent initial sends have one SQL winner. Recovery uses identical bytes/key. At-most-once provider execution depends on OutLayer's deduplication contract and preserving the recovery database. |
| Cancel versus claim | Versioned job updates and the unique attempt row prevent both winning the same reservation. Cancellation is blocked once an attempt exists. |
| Explicit uncertainty | Timeouts stay `sending`; duplicates become `read_original`; processing, policy approval, review, wallet-busy and unknown statuses block new sends. Failure stays `failed_unproven`, even when the provider reports never-executed/submitted. |
| Receipt-verified Paid | Provider success is not Paid. Matching FINAL receipt checks precede an atomic, versioned SQL update confirming both attempt and job. |
| Spending limits | **Recommended external OutLayer policy**, not a MaintPay policy engine. The owner configures a recipient whitelist, cap and approvals. MaintPay submits the agreed recipient/amount and surfaces blocks; it does not install or audit policy. |

## Quickstart for judges

### Start and sign in

Requires **Node 22**, npm and internet access for GitHub, OutLayer and NEAR testnet. No external database or OAuth client is required locally.

```bash
git clone https://github.com/cipoklean/maintpay.git
cd maintpay
npm install
# Optional: cp .env.example .env, then edit server settings.
npm run dev
```

In another terminal in the repo:

```bash
npm run demo:seed
```

**See:** `http://localhost:8080/login` has email/password signup/sign-in. The seed prints verified accounts; running it again prints `already exists` without resetting passwords.

| Role | Email | Default password |
| --- | --- | --- |
| Client | `client@demo.maintpay` | `MaintPay-demo-2026!` |
| Contributor | `worker@demo.maintpay` | `MaintPay-demo-2026!` |
| Approver | `approver@demo.maintpay` | `MaintPay-demo-2026!` |

Use **three browser profiles/sessions**. Role tabs do not impersonate accounts. Arbitrary valid emails may also sign up locally. `DEMO_PASSWORD` overrides the seeded password.

Local dev defaults `MAINTPAY_DEMO_AUTO_VERIFY=true` outside Vercel/production. This is **not email ownership verification**; set it `false` to disable. Without `DATABASE_URL`, auth/jobs share in-memory PGlite: restarting wipes both, so seed again. Seeding uses the running server, not a separate database.

### Get and fund a dedicated testnet wallet

```bash
npm run outlayer:register
```

**See:** `near_account_id` (64 hex characters) and `api_key` (`wk_…`). The CLI writes no files. Save the credential securely **outside the repo and recordings/logs**. Never paste a private signing key into MaintPay.

Before funding, open `https://app.outlayer.ai/wallet?key=…` with the testnet wallet's credential substituted locally and configure a recipient whitelist and small spending cap. Do not share or film that credential-bearing URL. Policy setup is external to MaintPay.

Fund the implicit address with about **0.1 testnet NEAR** for a **0.01 NEAR** payment plus gas. If a faucet only accepts named accounts, use a named testnet account you control as an intermediary:

1. Run [NEAR CLI](https://github.com/near/near-cli-rs) with `npx near-cli-rs`. Its interactive **account → create-account → sponsor-by-faucet-service** flow creates a funded named account; generate/save its keys locally and choose **testnet**, never mainnet.
2. Alternatively, fund your existing named testnet wallet through [near-faucet.io](https://near-faucet.io). This faucet rejected a bare 64-hex receiver during our test; do not assume direct implicit-account funding works.
3. Use the CLI's **tokens → your named account → send-near** flow to send `0.1 NEAR` to the OutLayer address, choose **testnet**, and sign with your local keychain. Save that transfer's hash and **actual named sender account** for the deposit check. Funding keys never enter MaintPay.

**See:** a successful native Transfer into the OutLayer wallet. Faucet availability/rate limits are external dependencies. Our recorded E2E used the NEAR helper faucet to create a funded named account, then sent 0.1 NEAR into the implicit wallet.

### Run the payout: do X, see Y

| Do this | See this |
| --- | --- |
| Client: **New agreement**. Enter task/criteria, repository `TanStack/router`, demo worker/approver emails, future expiry, your new wallet, amount `0.01`, and an existing testnet recipient you control. `faucet.accord-v2.testnet` was the recipient in our disposable test. | Open **Check this** for recipient and wallet, read them, then **Save the agreement** → `agreed`. Use only test funds. |
| Client: **Read the wallet**. Enter the inbound hash and actual sender, then **Check this deposit**. | Balance snapshot/deposit amount; `funding_observed`. A snapshot is not a lock. |
| Contributor: open the copied job link and link `https://github.com/TanStack/router/pull/8919`, or another eligible PR in the agreed repository. | Head SHA and `in_review`. This historical merged PR is integration evidence, not a claim its authors participated in MaintPay. |
| Approver: open the job link, inspect criteria/commit, select **Accept this commit**, then **Confirm accept**. | `accepted` and a decision record. |
| Client: reload the job URL. Select **Prepare the payment**, then **Store one attempt. Sending is a separate action.** | `payment_in_flight`, attempt `claimed`; nothing submitted yet. |
| Client: paste the API credential into the password input and select **Send payment**. | Input clears; provider request ID is recorded. Automatic FINAL verification can take the job directly to `confirmed`. |
| If `sending`, re-enter the credential and retry **Send payment**. If `blocked`/`read_original` with request ID, use **Check status**. If `awaiting_chain`, use **Confirm on chain**, no credential needed. | Send recovery uses the same stored body/key. Policy approval may require OutLayer action. Unknown/review is not Paid; never open a replacement attempt. |
| Open **Paid — view the final chain transaction** after confirmation. | Nearblocks shows the agreed signer, receiver, exactly 0.01 NEAR and successful execution. Send payment is no longer offered. |

Reload the shared job URL between profile changes: updates are fetched on load/actions, not live-pushed. On a separate fresh agreement, cancel before claim: relinking/deposit checks remain refused. After claim, cancellation is refused. Duplicate deposit receipts and active wallet reuse are refused.

### Real confirmed evidence

Job `MP-9e773b90`, OutLayer request `c4cbe7cc-0b44-4432-9bc8-82538c8aa3ed`, sent **0.01 NEAR**:

**[Confirmed transaction: EgHfMiLrX6od81wjDZRGScze3PQEueg8Pdgwm9srAM4Q](https://testnet.nearblocks.io/txns/EgHfMiLrX6od81wjDZRGScze3PQEueg8Pdgwm9srAM4Q)**

- Signer: `b4b8d40eb90881d5e41568b255c3f347d954e7cf6876fdac64b9c4c6b638013d`.
- Receiver: `faucet.accord-v2.testnet`; deposit: `10000000000000000000000` yoctoNEAR.
- RPC: `final_execution_status: FINAL`, `status: {"SuccessValue":""}`.
- Authenticated RPC also refused a wrong-wallet key, contributor send and second send after confirmation. Timeout recovery/concurrent initial sends were tested with mocks/PGlite, not a deliberately interrupted real payment.

This is historical evidence, not a seeded job or reusable deposit/credential. A fresh local database will not contain that job. Payment UI controls remain visually unverified; the real flow was exercised through authenticated server-function RPC.

## Configuration

Variables from `.env.example` are below. Dev/seed/register commands load an optional, git-ignored `.env`. Inject deployed server settings through the host. Never configure the wallet `wk_…` on the server.

| Variable | Purpose / default |
| --- | --- |
| `GITHUB_TOKEN` | Optional server bearer token for public PR quota; without it rate limits can block linking/claiming. |
| `OUTLAYER_API_BASE` | `https://testnet-api.outlayer.ai`; keep testnet. No credential belongs here. |
| `DATABASE_URL` | Empty → in-memory PGlite. Postgres URL enables persistence; seeding uses the running server's backend. |
| `BETTER_AUTH_SECRET` | Stable random 32+ character deployment secret; local fallback is process-stable random. |
| `BETTER_AUTH_URL` | Public auth origin; example `http://localhost:8080`. Unset uses preview/loopback dynamic hosts. Also selects seed target origin. |
| `MAINTPAY_DEMO_AUTO_VERIFY` | Only literal `true` verifies new users. Local dev defaults on; Vercel/production dev wrapper defaults off. Build/preview/server do not default it on. Explicit `true` opts in anywhere. |
| `DEMO_PASSWORD` | Default `MaintPay-demo-2026!`; seeding does not reset existing accounts. |
| `GROK_AUTH_ISSUER` | OAuth broker issuer override; otherwise shared preview issuer. |
| `GROK_AUTH_CLIENT_ID` | Per-app deployed OAuth client; otherwise shared sandbox-preview client. |
| `GROK_AUTH_CLIENT_SECRET` | Matching server-only OAuth secret; otherwise shared preview credentials. |

Leave `VITE_AUTH_ENABLED` unset or `true`; auth-off is not a judge login because job actions still require a verified database user. Vercel does not automatically select production OAuth credentials: provide registered broker credentials/callbacks, HTTPS `BETTER_AUTH_URL`, stable secret and persistent database. Never deploy the local demo `.env` as production configuration.

## Tests

```bash
npm test
npm run lint
npm run typecheck
npm run check:auth  # requires npm run dev on 8080
npm run build
node scripts/brand-check.mjs
```

Both test phases run even if one fails. Tests cover lifecycle/roles, email verification, terms hashing, duplicate funding, atomic review, provider statuses, receipt parsing, same-key recovery and PGlite concurrency/confirmation. Unshipped template-document checks skip gracefully; the repository's custom social-card check is mandatory.

Build migrates `DATABASE_URL`; otherwise PGlite applies `migrations/*.sql` on startup. Existing duplicate receipts/active wallets need reconciliation before unique indexes migrate. Build emits third-party `"use client"` directive warnings. Non-force audit fixes were applied; the last audit still reported 10 vulnerabilities (2 low, 7 moderate, 1 critical). This is not a production security certification.

## Architecture

- `src/components/maintpay/handoff.tsx`, `src/routes/`: agreement, role/payment views and login/job/sample pages.
- `src/lib/maintpay/control.ts`: pure guards, hashes, provider interpretation and receipt matching.
- `api.ts`, `payment-store.ts`: authenticated TanStack server functions and versioned SQL transitions.
- `github.ts`, `outlayer.ts`, `near.ts`: external reads/submission; provider credentials are transient.
- `src/lib/db.ts`, `migrations/`: shared Postgres/PGlite schema/bootstrap.
- `src/lib/auth/`, `scripts/demo-*.mjs`: Better Auth and opted-in judge setup.
- React, TanStack Start/Router, Vite, Tailwind and Nitro provide the stack. No custom NEAR contract is deployed.

## Built during NEAR Hackathon

Built for [NEAR HACKATHON](https://nearhackathon.com/HACKATHON.md). Recorded project work is dated **2026-11-12**, within the published window. AI-assisted implementation/testing was used.

**Template disclosure:** this began with an app scaffold. It supplied Better Auth/OAuth/session infrastructure, generic `src/lib/app-data/` connector/readiness helpers, database/migration plumbing, preview/host/PWA/share tooling and build/test configuration. These are infrastructure, not original MaintPay payout features. MaintPay-specific work covers agreements/roles, commit review, guarded lifecycle, GitHub evidence, OutLayer sending/recovery, NEAR receipt verification and demo setup. Dependencies retain their upstream licenses.

The initial commit combines scaffold files and MaintPay v1; there is **no separate pristine-template commit** here. This is the available provenance, not a claim every initial file was written during the event:

| Commit | Work |
| --- | --- |
| [`9fa893b`](https://github.com/cipoklean/maintpay/commit/9fa893b) | Initial agreement/review/attempt-only MaintPay alongside scaffold. |
| [`abb7b79`](https://github.com/cipoklean/maintpay/commit/abb7b79) | Lifecycle guards, verified actors, terms hashes and unique funding/wallet reservations. |
| [`b1aa02b`](https://github.com/cipoklean/maintpay/commit/b1aa02b) | Optional GitHub auth and FINAL inbound verification. |
| [`f20f235`](https://github.com/cipoklean/maintpay/commit/f20f235) | Both test phases, template-check adaptation and lint repairs. |
| [`0ed1a95`](https://github.com/cipoklean/maintpay/commit/0ed1a95) | Non-breaking dependency audit updates. |
| [`27d4840`](https://github.com/cipoklean/maintpay/commit/27d4840) | Email login UI and demo verification opt-in. |
| [`ffd9882`](https://github.com/cipoklean/maintpay/commit/ffd9882) | Judge setup and idempotent user seeding. |
| [`aa7a5bb`](https://github.com/cipoklean/maintpay/commit/aa7a5bb) | Immutable sending/recovery and atomic FINAL receipt confirmation. |
| [`55705ae`](https://github.com/cipoklean/maintpay/commit/55705ae) | Payment controls, wallet registration and custody documentation. |

[Diff after the combined initial snapshot](https://github.com/cipoklean/maintpay/compare/9fa893b...55705ae). Inspect initial `src/lib/maintpay/`, `src/components/maintpay/` and `migrations/0002_maintpay.sql` for v1. The submission-package update adds this README, MIT license and share card; `git log --oneline` identifies it. The app does not submit hackathon applications.

## Limitations / next steps

- Testnet/native NEAR only: no mainnet, stablecoin payroll, cross-chain settlement, escrow, arbitration or guaranteed funding.
- PGlite is disposable: losing the database loses the app's recovery record. Use durable Postgres/backups before real service use. A fresh database is not a safe payment retry.
- No real verification-email sender is configured. No hosted demo is published here yet; an isolated hosted judge demo would need explicit demo auto-verification for arbitrary emails. Never enable that shortcut for real users.
- OutLayer policies are external owner controls. MaintPay does not enforce a global budget, manage approvals, verify TEE attestation or stop spending elsewhere.
- GitHub is rechecked at claim, not continuously or again at send. Contributor GitHub identity is not bound to email; a PR can be relinked before a decision.
- Unknown/review/failed states require reconciliation, not replacement attempts. No background polling/retry worker or account recovery.
- Next: durable deployment/monitoring, real email verification, policy visibility, stronger identity binding and independent security review.

## License

[MIT](LICENSE). Copyright © 2026 Aghazie David. Dependencies and scaffold-derived components remain subject to applicable upstream licenses.
