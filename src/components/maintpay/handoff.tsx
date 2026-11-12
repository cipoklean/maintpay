import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AGREEMENT_FOCUS_ORDER, checkReading, validateAgreement } from "@/lib/maintpay/form-ui";
import { cancelJob, checkDeposit, claimAttempt, createJob, getJob, linkPull, listJobs, readBalance, review, type JobView } from "@/lib/maintpay/api";
import { shareJobUrl } from "@/lib/maintpay/job-link";
import { isIllustrativeJob, SAMPLE_BANNER } from "@/lib/maintpay/sample";

const ROLES = [
  { id: "client", label: "Client" },
  { id: "contributor", label: "Contributor" },
  { id: "approver", label: "Approver" },
] as const;

type RoleId = (typeof ROLES)[number]["id"];

const STATUS: Record<string, string> = {
  agreed: "Agreed",
  funding_observed: "Funds checked",
  pr_ready: "Pull request linked",
  in_review: "Waiting for review",
  accepted: "Accepted",
  held: "Held",
  payment_in_flight: "Attempt stored",
  confirmed: "Paid on chain",
  cancelled: "Cancelled",
  rejected: "Not accepted",
};

export function Handoff() {
  const { user } = useCurrentUserState();
  const load = useServerFn(listJobs);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadRef.current().then((rows) => {
      if (cancelled) return;
      setJobs(rows);
      setSelected((current) => current ?? rows[0]?.id ?? null);
    }).catch(() => {
      if (!cancelled) setError("The jobs could not be read.");
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const job = jobs.find((item) => item.id === selected) ?? null;

  function replace(next: JobView) {
    setJobs((current) => {
      const rest = current.filter((item) => item.id !== next.id);
      return [next, ...rest];
    });
    setSelected(next.id);
    setCreating(false);
    setError(null);
  }

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 xl:max-w-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
          <UserButton />
        </div>
        <h1 className="font-display text-3xl leading-tight break-words text-ink sm:text-5xl">Work reviewed, then one payment.</h1>
      </header>

      <p className="rounded-md border border-line bg-card px-4 py-3 text-base leading-relaxed text-ink">
        This build stops before a transfer. A stored attempt is not a payment. A testnet balance is only a reading. Whether two earlier payments shared an idempotency header is unknown, and that is not treated as safe.
      </p>

      <div className="flex flex-col gap-2">
        {jobs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSelected(item.id);
              setCreating(false);
            }}
            className={`flex min-h-11 w-full flex-col items-start justify-center gap-1 break-words rounded-sm border px-3 py-2 text-left ${item.id === job?.id && !creating ? "border-sage bg-sage-bg text-ink" : "border-line bg-card text-ink"}`}
          >
            <span className="text-base">{item.task}</span>
            <span className="text-base text-muted">
              {STATUS[item.status] ?? item.status} · {item.id}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper">
          New agreement
        </button>
      </div>

      {error ? <p className="rounded-sm bg-hold-bg px-3 py-3 text-base text-hold">{error}</p> : null}
      {creating || !job ? <Create onCreated={replace} onError={setError} /> : <JobCard job={job} onChange={replace} onError={setError} />}
    </div>
  );
}

export function FocusedJob({ jobId }: { jobId: string }) {
  const { user } = useCurrentUserState();
  const load = useServerFn(getJob);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [job, setJob] = useState<JobView | null>(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadRef.current({ data: { jobId } })
      .then((result) => {
        if (cancelled) return;
        if (!result?.ok || !result.job) {
          setJob(null);
          setClosed(true);
          return;
        }
        setClosed(false);
        setJob(result.job);
      })
      .catch(() => {
        if (!cancelled) setError("The agreement could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, jobId]);

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 xl:max-w-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium tracking-wide text-sage uppercase">MaintPay</p>
          <UserButton />
        </div>
        <h1 className="font-display text-3xl leading-tight break-words text-ink">This agreement</h1>
      </header>
      <Link to="/" className="inline-flex min-h-11 items-center text-base font-medium text-sage">
        All agreements
      </Link>
      {error ? <p className="rounded-sm bg-hold-bg px-3 py-3 text-base text-hold">{error}</p> : null}
      {closed ? (
        <div className="rounded-md border border-line bg-card p-4">
          <h2 className="font-display text-2xl leading-tight text-ink">This agreement is not open for this account.</h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Sign in with the client, contributor, or approver email named on it. Nothing from the agreement is shown here, and nothing was paid.
          </p>
        </div>
      ) : null}
      {!job && !closed && !error ? <p className="text-base text-muted">Opening this agreement.</p> : null}
      {job ? (
        <JobCard
          job={job}
          onChange={(next) => {
            setJob(next);
            setError(null);
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function Create({ onCreated, onError }: { onCreated: (job: JobView) => void; onError: (message: string) => void }) {
  const { user } = useCurrentUserState();
  const create = useServerFn(createJob);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    task: "",
    criteria: "",
    repository: "",
    worker: "",
    approver: "",
    recipient: "",
    amount: "",
    expiry: "",
    wallet: "",
  });
  const [checked, setChecked] = useState({ wallet: false, recipient: false });

  function update(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (name === "wallet" || name === "recipient") setChecked((current) => ({ ...current, [name]: false }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateAgreement({
      ...values,
      walletChecked: checked.wallet,
      recipientChecked: checked.recipient,
      clientEmail: user?.primaryEmail ?? "",
    });
    setErrors(found);
    setBanner(null);
    const first = AGREEMENT_FOCUS_ORDER.find((name) => found[name]);
    if (first) {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
      el?.focus();
      el?.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    setPending(true);
    try {
      const result = await create({
        data: {
          task: values.task,
          criteria: values.criteria,
          repository: values.repository,
          workerEmail: values.worker,
          approverEmail: values.approver,
          recipient: values.recipient,
          amount: values.amount,
          expiresAt: new Date(`${values.expiry}T23:59:00`).toISOString(),
          walletAddress: values.wallet,
        },
      });
      if (!result.ok || !result.job) {
        setBanner(result.ok ? "The agreement was not saved." : result.error);
        return;
      }
      onCreated(result.job);
    } catch {
      onError("The agreement could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-card p-4">
      <h2 className="font-display text-2xl">Agree the work</h2>
      <p className="text-base leading-relaxed text-muted">You are the client. The approver and the contributor must be two other people.</p>
      <Field name="task" label="What needs doing" value={values.task} error={errors.task} onValue={(value) => update("task", value)} />
      <Field name="criteria" label="How you will know it is done" value={values.criteria} error={errors.criteria} onValue={(value) => update("criteria", value)} />
      <Field name="repository" label="Repository" placeholder="owner/name" value={values.repository} error={errors.repository} onValue={(value) => update("repository", value)} />
      <Field name="worker" label="Contributor email" type="email" value={values.worker} error={errors.worker} onValue={(value) => update("worker", value)} />
      <Field name="approver" label="Approver email" type="email" value={values.approver} error={errors.approver} onValue={(value) => update("approver", value)} />
      <Field name="recipient" label="NEAR account that should be paid" mono value={values.recipient} error={errors.recipient} onValue={(value) => update("recipient", value)} />
      <CheckValue
        name="recipientCheck"
        value={values.recipient}
        open={checked.recipient}
        error={errors.recipientCheck}
        onOpen={() => setChecked((current) => ({ ...current, recipient: true }))}
      />
      <Field name="amount" label="Amount in NEAR" placeholder="0.1" inputMode="decimal" value={values.amount} error={errors.amount} onValue={(value) => update("amount", value)} />
      <Field name="expiry" label="Offer expires" type="date" value={values.expiry} error={errors.expiry} onValue={(value) => update("expiry", value)} />
      <Field name="wallet" label="Dedicated wallet address" mono value={values.wallet} error={errors.wallet} onValue={(value) => update("wallet", value)} />
      <CheckValue
        name="walletCheck"
        value={values.wallet}
        open={checked.wallet}
        error={errors.walletCheck}
        onOpen={() => setChecked((current) => ({ ...current, wallet: true }))}
      />
      {banner ? <p className="text-base text-hold">{banner}</p> : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-4 text-base font-medium text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save the agreement"}
      </button>
    </form>
  );
}

function JobLink({ id }: { id: string }) {
  const [href, setHref] = useState(`/job/${id}`);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setHref(shareJobUrl(id, window.location));
    setNote(null);
  }, [id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setNote("Copied.");
    } catch {
      setNote("Select the link and copy it.");
    }
  }

  return (
    <div className="mt-4 flex min-w-0 flex-col gap-2">
      <p className="text-base leading-relaxed text-ink">
        Send this to the contributor and the approver. Each one signs in with the email on this agreement. The link does not move money.
      </p>
      <p className="break-all rounded-sm border border-sage bg-paper px-3 py-3 font-mono text-base leading-relaxed text-ink">{href}</p>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 w-full items-center justify-center rounded-sm border border-line px-3 text-base font-medium">
        Copy link
      </button>
      {note ? <p className="text-base text-muted">{note}</p> : null}
    </div>
  );
}

function JobCard({
  job,
  onChange,
  onError,
}: {
  job: JobView;
  onChange: (job: JobView) => void;
  onError: (message: string) => void;
}) {
  const [role, setRole] = useState<RoleId>(job.role);
  useEffect(() => setRole(job.role), [job.id, job.role]);

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3" role="tablist">
        {ROLES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={role === item.id}
            onClick={() => setRole(item.id)}
            className={`inline-flex min-h-11 items-center justify-center rounded-sm px-3 text-base font-medium ${role === item.id ? "bg-ink text-paper" : "border border-line bg-card text-ink"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 rounded-md border border-line bg-card p-4">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl leading-tight break-words">{job.task}</h2>
          <div className="flex flex-col items-start gap-2">
            <span className="w-fit rounded-sm bg-sage-bg px-2.5 py-1 text-base font-semibold tracking-wide text-sage uppercase">{STATUS[job.status] ?? job.status}</span>
            {isIllustrativeJob(job) ? <p className="text-base leading-snug text-ink">{SAMPLE_BANNER}</p> : null}
          </div>
        </div>
        {job.attempt && job.status !== "confirmed" ? (
          <p className="mt-3 text-base leading-relaxed text-ink">
            This build stops here. One attempt is stored. MaintPay does not send it, and a stored attempt is not a payment.
          </p>
        ) : null}
        <JobLink id={job.id} />
        <p className="mt-3 text-base leading-relaxed text-muted">{job.criteria}</p>
        <ol className="mt-5 grid gap-2">
          {job.progress.map((step) => (
            <li key={step.name} className={`rounded-sm border px-3 py-3 text-base ${step.done ? "border-sage bg-sage-bg text-ink" : "border-line text-muted"}`}>
              {step.name}
            </li>
          ))}
        </ol>
        {job.holdReason ? (
          <div className="mt-4 rounded-sm bg-hold-bg px-3 py-3 text-base text-hold">
            <p className="font-medium">{job.holdReason}</p>
            {job.holdRemedy ? <p className="mt-1">{job.holdRemedy}</p> : null}
          </div>
        ) : null}
        <h3 className="mt-5 font-display text-2xl">Record</h3>
        {job.events.length ? (
          <ol className="mt-2 grid gap-2">
            {job.events.map((event) => (
              <li key={`${event.at}-${event.title}`} className="rounded-sm border border-line px-3 py-3">
                <p className="text-base font-medium text-ink">{event.title}</p>
                <p className="mt-1 text-base leading-relaxed text-muted">{event.detail}</p>
                <p className="mt-1 text-base text-muted">{event.at.slice(0, 10)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-base text-muted">Nothing has been recorded yet.</p>
        )}
      </div>
      <RolePane role={role} job={job} onChange={onChange} onError={onError} />
      <details className="rounded-md border border-line bg-card px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">Audit details</summary>
        <dl className="grid gap-2 pb-2 text-base break-all text-muted">
          <div>Repository {job.repository}</div>
          <div className="break-all">Wallet {job.walletAddress}</div>
          <div className="break-all">Recipient {job.recipient}</div>
          <div>Amount {job.amountLabel}</div>
          {job.headSha ? <div className="break-all">Head {job.headSha}</div> : null}
          {job.attempt ? (
            <>
              <div className="break-all">Body hash {job.attempt.bodyHash}</div>
              <div>Header key {job.attempt.keyHint}. It is not inside the transfer JSON.</div>
              {job.attempt.providerRequestId ? <div>Request {job.attempt.providerRequestId}</div> : null}
              {job.attempt.txHash ? <div className="break-all">Transaction {job.attempt.txHash}</div> : null}
            </>
          ) : null}
        </dl>
      </details>
    </section>
  );
}

function RolePane({
  role,
  job,
  onChange,
  onError,
}: {
  role: RoleId;
  job: JobView;
  onChange: (job: JobView) => void;
  onError: (message: string) => void;
}) {
  if (role !== job.role) {
    return (
      <p className="rounded-md border border-line bg-card px-4 py-4 text-base leading-relaxed text-muted">
        You are signed in as the {job.role}. This screen is for the {role}. Their actions stay locked to their own account.
      </p>
    );
  }
  if (role === "contributor") return <Contributor job={job} onChange={onChange} onError={onError} />;
  if (role === "approver") return <Approver job={job} onChange={onChange} onError={onError} />;
  return <Client job={job} onChange={onChange} onError={onError} />;
}

function Client({ job, onChange, onError }: { job: JobView; onChange: (job: JobView) => void; onError: (message: string) => void }) {
  const balance = useServerFn(readBalance);
  const deposit = useServerFn(checkDeposit);
  const claim = useServerFn(claimAttempt);
  const cancel = useServerFn(cancelJob);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"claim" | "cancel" | null>(null);
  const [local, setLocal] = useState<string | null>(null);

  async function run(label: string, work: () => Promise<{ ok: boolean; error?: string; job?: JobView | null }>) {
    setPending(label);
    setLocal(null);
    try {
      const result = await work();
      if (result.job) onChange(result.job);
      if (!result.ok) setLocal(result.error ?? "That did not work.");
    } catch {
      onError("That did not work.");
    } finally {
      setPending(null);
      setConfirm(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-card p-4">
      <h2 className="font-display text-2xl">Your promise</h2>
      <p className="text-base leading-relaxed text-muted">
        Pay {job.amountLabel} to the agreed account after the approver accepts the exact commit. You can still move the money yourself. This is not escrow.
      </p>
      <p className="text-base leading-relaxed">
        Latest reading: {job.snapshotLabel ?? "not read yet"}.
        {job.gasLabel ? ` About ${job.gasLabel} would remain after the payment, and that is only a snapshot.` : " A reading is not a deposit."}
        {job.depositLabel ? ` A deposit of ${job.depositLabel} was checked.` : " No deposit has been checked."}
      </p>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => run("read", () => balance({ data: { jobId: job.id } }))}
        className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line px-3 text-base font-medium"
      >
        {pending === "read" ? "Reading…" : "Read the wallet"}
      </button>
      <DepositForm
        disabled={pending !== null}
        onSubmit={(tx, sender) =>
          run("deposit", () =>
            deposit({
              data: { jobId: job.id, txHash: tx, sender },
            }),
          )
        }
      />
      {job.status === "accepted" && !job.attempt ? (
        confirm === "claim" ? (
          <button type="button" onClick={() => run("claim", () => claim({ data: { jobId: job.id } }))} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-3 py-2 text-center text-base font-medium text-paper">
            Store one attempt. Do not send it.
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm("claim")} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-3 text-base font-medium text-paper">
            Prepare the payment
          </button>
        )
      ) : null}
      {job.attempt ? (
        <p className="text-base leading-relaxed text-warn">
          The attempt is stored and nothing has been sent. This build does not send it.
        </p>
      ) : null}
      {job.canCancel ? (
        confirm === "cancel" ? (
          <button type="button" onClick={() => run("cancel", () => cancel({ data: { jobId: job.id } }))} className="inline-flex min-h-11 items-center justify-center rounded-sm border border-hold px-3 py-2 text-center text-base font-medium text-hold">
            Confirm cancellation. This does not recover funds.
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm("cancel")} className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line px-3 text-base font-medium text-hold">
            Cancel this agreement
          </button>
        )
      ) : null}
      {local ? <p className="text-base text-hold">{local}</p> : null}
    </div>
  );
}

function Contributor({ job, onChange, onError }: { job: JobView; onChange: (job: JobView) => void; onError: (message: string) => void }) {
  const link = useServerFn(linkPull);
  const [pending, setPending] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-card p-4">
      <h2 className="font-display text-2xl">Your work</h2>
      <p className="rounded-sm bg-warn-bg px-3 py-3 text-base leading-relaxed text-warn">
        The {job.amountLabel} can be withdrawn by the client until a payment is actually sent. This is not guaranteed escrow.
      </p>
      <p className="text-base leading-relaxed text-muted">Offer expires {job.expiresAt.slice(0, 10)}. Status: {STATUS[job.status]}.</p>
      {job.headSha ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="break-all font-mono text-base leading-relaxed">{job.headSha}</p>
          {job.prUrl ? (
            <a href={job.prUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-base text-sage underline">
              Open the pull request
            </a>
          ) : null}
        </div>
      ) : (
        <PullForm
          pending={pending}
          onSubmit={async (url) => {
            setPending(true);
            setLocal(null);
            try {
              const result = await link({ data: { jobId: job.id, url } });
              if (result.job) onChange(result.job);
              if (!result.ok) setLocal(result.error ?? "That pull request was not linked.");
            } catch {
              onError("GitHub could not be read.");
            } finally {
              setPending(false);
            }
          }}
        />
      )}
      <p className="text-base text-muted">
        {job.status === "confirmed"
          ? "A chain receipt was checked for this payment."
          : job.attempt
            ? "A payment attempt is stored. It has not been confirmed on chain."
            : job.status === "accepted"
              ? "The approver accepted this commit. Payment is not sent yet."
              : "Acceptance has not happened."}
      </p>
      {local ? <p className="text-base text-hold">{local}</p> : null}
    </div>
  );
}

function Approver({ job, onChange, onError }: { job: JobView; onChange: (job: JobView) => void; onError: (message: string) => void }) {
  const decide = useServerFn(review);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"accepted" | "rejected" | null>(null);
  const [local, setLocal] = useState<string | null>(null);

  async function send(decision: "accepted" | "rejected") {
    setPending(true);
    setLocal(null);
    try {
      const result = await decide({ data: { jobId: job.id, decision } });
      if (result.job) onChange(result.job);
      if (!result.ok) setLocal(result.error ?? "The decision was not saved.");
    } catch {
      onError("The decision was not saved.");
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-card p-4">
      <h2 className="font-display text-2xl">This snapshot</h2>
      <p className="text-base leading-relaxed text-muted">
        Accept only if this commit matches the criteria. Acceptance can start one attempt. It cannot promise the funds are still there.
      </p>
      {job.prUrl ? (
        <a href={job.prUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-base text-sage underline">
          Open the pull request
        </a>
      ) : (
        <p className="text-base text-muted">The contributor has not linked a pull request.</p>
      )}
      {job.headSha ? <p className="break-all font-mono text-base leading-relaxed">{job.headSha}</p> : null}
      {job.prState ? <p className="text-base text-muted">GitHub says {job.prState}. A merge is not your acceptance.</p> : null}
      {job.status === "in_review" ? (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <button type="button" disabled={pending} onClick={() => (confirm === "accepted" ? send("accepted") : setConfirm("accepted"))} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-3 text-base font-medium text-paper">
            {confirm === "accepted" ? "Confirm accept" : "Accept this commit"}
          </button>
          <button type="button" disabled={pending} onClick={() => (confirm === "rejected" ? send("rejected") : setConfirm("rejected"))} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-hold px-3 text-base font-medium text-paper">
            {confirm === "rejected" ? "Confirm reject" : "Reject"}
          </button>
        </div>
      ) : (
        <p className="text-base text-muted">{STATUS[job.status]}. There is no decision waiting.</p>
      )}
      {local ? <p className="text-base text-hold">{local}</p> : null}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  error,
  mono,
  value,
  onValue,
  inputMode,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  error?: string;
  mono?: boolean;
  value?: string;
  onValue?: (value: string) => void;
  inputMode?: "decimal" | "text" | "email" | "url";
}) {
  const errorId = `${name}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={name} className="text-base">
        {label}
      </label>
      <input
        id={name}
        name={name}
        data-field={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={onValue ? (event) => onValue(event.target.value) : undefined}
        suppressHydrationWarning
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`min-h-11 w-full min-w-0 rounded-sm border bg-paper px-3 text-base text-ink ${mono ? "font-mono" : ""} ${error ? "border-hold" : "border-line"}`}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-base leading-snug text-hold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CheckValue({
  name,
  value,
  open,
  error,
  onOpen,
}: {
  name: string;
  value: string;
  open: boolean;
  error?: string;
  onOpen: () => void;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        data-field={name}
        onClick={onOpen}
        aria-describedby={error ? errorId : undefined}
        className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line px-3 text-base font-medium"
      >
        Check this
      </button>
      {open ? (
        <CheckPreview value={value} />
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-base leading-snug text-hold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CheckPreview({ value }: { value: string }) {
  const reading = checkReading(value);
  return (
    <div className="min-w-0 rounded-sm border border-sage bg-paper px-3 py-3">
      <p className="text-base text-muted">
        {reading.kind === "hex"
          ? "Each group of four is the address that would be saved. The spaces are only for reading."
          : "This is the account that would be saved."}
      </p>
      {reading.kind === "empty" ? <p className="mt-2 font-mono text-lg">Nothing entered yet.</p> : null}
      {reading.kind === "near" ? <AccountReading value={reading.shown} /> : null}
      {reading.kind === "hex" ? <HexReading value={reading.shown} /> : null}
    </div>
  );
}

function AccountReading({ value }: { value: string }) {
  const parts = value.split(/([.-])/);
  return (
    <p className="mt-2 font-mono text-lg leading-relaxed" style={{ overflowWrap: "normal", wordBreak: "keep-all" }}>
      {parts.map((part, index) =>
        part === "-" || part === "." ? (
          <span key={index}>
            {part}
            <wbr />
          </span>
        ) : (
          <span key={index} className="whitespace-nowrap">
            {part}
          </span>
        ),
      )}
    </p>
  );
}

function HexReading({ value }: { value: string }) {
  const groups = value.split(" ");
  return (
    <p className="mt-2 font-mono text-lg leading-relaxed">
      {groups.map((group, index) => (
        <span key={index}>
          <span className="whitespace-nowrap">{group}</span>
          {index < groups.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}

function DepositForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (tx: string, sender: string) => void }) {
  const [tx, setTx] = useState("");
  const [sender, setSender] = useState("");
  const [errors, setErrors] = useState<{ tx?: string; sender?: string }>({});
  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const next: { tx?: string; sender?: string } = {};
        if (!tx.trim()) next.tx = "Enter the deposit transaction.";
        if (!sender.trim()) next.sender = "Enter the account that sent it.";
        setErrors(next);
        if (next.tx || next.sender) {
          document.getElementById(next.tx ? "tx" : "sender")?.focus();
          return;
        }
        onSubmit(tx.trim(), sender.trim());
      }}
    >
      <Field name="tx" label="Deposit transaction" mono value={tx} error={errors.tx} onValue={setTx} />
      <Field name="sender" label="Account that sent it" mono value={sender} error={errors.sender} onValue={setSender} />
      <button type="submit" disabled={disabled} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-3 text-base font-medium text-paper disabled:opacity-50">
        Check this deposit
      </button>
    </form>
  );
}

function PullForm({ pending, onSubmit }: { pending: boolean; onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim()) {
          setError("Paste the public pull request link.");
          document.getElementById("url")?.focus();
          return;
        }
        setError(null);
        onSubmit(url.trim());
      }}
    >
      <Field name="url" label="Public pull request link" placeholder="https://github.com/org/repo/pull/123" inputMode="url" value={url} error={error ?? undefined} onValue={setUrl} />
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-sage px-3 text-base font-medium text-paper disabled:opacity-50">
        {pending ? "Reading GitHub…" : "Link this pull request"}
      </button>
    </form>
  );
}
