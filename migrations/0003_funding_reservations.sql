create unique index if not exists funding_deposit_tx_unique
  on funding (tx_hash) where kind = 'deposit';

create unique index if not exists jobs_active_wallet_unique
  on jobs (wallet_address) where status not in ('cancelled', 'confirmed', 'rejected');
