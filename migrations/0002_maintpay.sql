create table if not exists jobs (
  id text primary key,
  client_user_id text not null,
  client_email text not null,
  approver_email text not null,
  worker_email text not null,
  repository text not null,
  task text not null,
  criteria text not null,
  recipient text not null,
  amount_yocto text not null,
  expires_at timestamptz not null,
  wallet_address text not null,
  status text not null,
  hold_reason text,
  hold_remedy text,
  pr_number integer,
  pr_url text,
  head_sha text,
  pr_state text,
  pr_title text,
  terms_hash text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint jobs_approver_worker check (lower(approver_email) <> lower(worker_email)),
  constraint jobs_client_approver check (lower(client_email) <> lower(approver_email))
);

create index if not exists jobs_client_idx on jobs (client_user_id);

create table if not exists funding (
  id text primary key,
  job_id text not null references jobs (id),
  kind text not null check (kind in ('deposit', 'snapshot')),
  amount_yocto text not null,
  tx_hash text,
  sender text,
  block_height integer,
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id text primary key,
  job_id text not null unique references jobs (id),
  approver_user_id text not null,
  approver_email text not null,
  decision text not null check (decision in ('accepted', 'rejected')),
  head_sha text not null,
  terms_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id text primary key,
  job_id text not null unique references jobs (id),
  provider text not null,
  wallet_address text not null,
  request_body text not null,
  body_hash text not null,
  idempotency_key text not null unique,
  state text not null,
  provider_request_id text,
  provider_status text,
  provider_error text,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table if not exists job_events (
  id bigserial primary key,
  job_id text not null references jobs (id),
  title text not null,
  detail text not null,
  created_at timestamptz not null default now()
);
