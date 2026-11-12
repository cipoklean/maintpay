import type { Sql } from "../db";
import type { Job } from "./control.ts";
import { sendAttemptProblem, type interpretProvider } from "./control.ts";

export async function beginSending(sql: Sql, job: Job): Promise<boolean> {
  if (sendAttemptProblem(job)) return false;
  const rows = await sql<{ job_id: string }>`
    with updated as (
      update jobs set version = version + 1
      where id = ${job.id} and version = ${job.version} and status = 'payment_in_flight'
        and exists (select 1 from attempts where job_id = jobs.id and id = ${job.attempt!.id}
          and state = ${job.attempt!.state} and state in ('claimed', 'sending'))
      returning id
    )
    update attempts set state = 'sending'
    from updated where attempts.job_id = updated.id and attempts.id = ${job.attempt!.id}
    returning attempts.job_id
  `;
  return rows.length === 1;
}

export async function persistProvider(sql: Sql, job: Job, read: ReturnType<typeof interpretProvider>): Promise<boolean> {
  const rows = await sql<{ job_id: string }>`
    with updated as (
      update jobs set version = version + 1
      where id = ${job.id} and version = ${job.version} and status = 'payment_in_flight'
        and exists (select 1 from attempts where job_id = jobs.id and id = ${job.attempt!.id} and state = ${job.attempt!.state})
      returning id
    ), stored as (
      update attempts set state = ${read.state}, provider_request_id = ${read.requestId ?? job.attempt!.providerRequestId},
        provider_status = ${read.status}, provider_error = ${read.error}, tx_hash = ${read.txHash ?? job.attempt!.txHash}
      from updated where attempts.job_id = updated.id and attempts.id = ${job.attempt!.id}
      returning attempts.job_id
    )
    insert into job_events (job_id, title, detail)
    select job_id, 'Payment status', ${read.plain} from stored returning job_id
  `;
  return rows.length === 1;
}

export async function persistConfirmation(sql: Sql, job: Job): Promise<boolean> {
  const rows = await sql<{ job_id: string }>`
    with updated as (
      update jobs set status = 'confirmed', version = version + 1
      where id = ${job.id} and version = ${job.version} and status = 'payment_in_flight'
        and exists (select 1 from attempts where job_id = jobs.id and id = ${job.attempt!.id}
          and state = 'awaiting_chain' and tx_hash = ${job.attempt!.txHash})
      returning id
    ), stored as (
      update attempts set state = 'confirmed'
      from updated where attempts.job_id = updated.id and attempts.id = ${job.attempt!.id}
      returning attempts.job_id
    )
    insert into job_events (job_id, title, detail)
    select job_id, 'Paid on chain', 'A final successful native NEAR receipt matches the wallet, recipient, amount and transaction.'
    from stored returning job_id
  `;
  return rows.length === 1;
}
